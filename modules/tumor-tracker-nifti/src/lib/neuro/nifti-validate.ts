import * as nifti from "nifti-reader-js";
import type { Affine, FileValidation, Sequence, ValidationIssue, VolumeGeometry, Vec3 } from "./types";
import { MAX_FILE_BYTES } from "./types";

export function hasNiftiExtension(name: string) {
  const n = name.toLowerCase();
  return n.endsWith(".nii") || n.endsWith(".nii.gz");
}

/** Filename-based suggestion only; user can correct it. */
export function guessSequence(name: string): Sequence | null {
  const n = name.toLowerCase().replace(/\.nii(\.gz)?$/, "");
  if (/flair/i.test(n)) return "FLAIR";
  if (/(t1gd|t1ce|t1c\b|t1_?gd|t1post|t1-ce|t1_ce|_ce\b|contrast|gad)/i.test(n)) return "T1Gd";
  if (/(t2|t2w|t2_)/i.test(n)) return "T2";
  if (/(t1|t1w|t1_)/i.test(n)) return "T1";
  return null;
}

function err(code: string, message: string): ValidationIssue {
  return { level: "error", code, message };
}
function warn(code: string, message: string): ValidationIssue {
  return { level: "warning", code, message };
}

/** Validate a raw NIfTI buffer (already decompressed or gz). Pure — testable. */
export function validateNiftiBuffer(
  fileName: string,
  sizeBytes: number,
  buffer: ArrayBuffer,
  opts: { isMask?: boolean } = {},
): FileValidation {
  const issues: ValidationIssue[] = [];
  const base: FileValidation = { fileName, sizeBytes, issues, valid: false };
  if (!hasNiftiExtension(fileName)) {
    issues.push(err("extension", "Only .nii and .nii.gz files are accepted."));
    return base;
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    issues.push(err("too_large", "File exceeds the 1 GB limit."));
    return base;
  }
  let data = buffer;
  try {
    if (nifti.isCompressed(data)) data = nifti.decompress(data) as ArrayBuffer;
  } catch {
    issues.push(err("unreadable", "Could not decompress the .nii.gz file."));
    return base;
  }
  if (!nifti.isNIFTI(data)) {
    issues.push(err("unreadable", "File is not a readable NIfTI-1/NIfTI-2 image."));
    return base;
  }
  let header: nifti.NIFTI1 | nifti.NIFTI2 | null;
  try {
    header = nifti.readHeader(data);
  } catch {
    header = null;
  }
  if (!header) {
    issues.push(err("unreadable", "NIfTI header could not be parsed."));
    return base;
  }
  const ndim = header.dims[0];
  const dims = header.dims.slice(1, 1 + Math.max(ndim, 0));
  const extra = dims.slice(3).filter((d) => d > 1);
  if (ndim < 3 || dims.slice(0, 3).some((d) => d < 2) || extra.length > 0) {
    issues.push(err("dimensionality", `Expected a single 3D volume; header reports ${ndim}D with dims [${dims.join(", ")}].`));
    return base;
  }
  const shape: Vec3 = [dims[0], dims[1], dims[2]];
  const spacing: Vec3 = [header.pixDims[1], header.pixDims[2], header.pixDims[3]];
  if (spacing.some((s) => !Number.isFinite(s) || s <= 0)) {
    issues.push(err("spacing", "Voxel spacing is missing or non-positive."));
    return base;
  }
  const affine: Affine = header.affine.map((r) => [...r]);
  const geometry: VolumeGeometry = { shape, spacing, affine };
  base.geometry = geometry;

  const ani = Math.max(...spacing) / Math.min(...spacing);
  if (ani > 3) issues.push(warn("anisotropic", `Strongly anisotropic spacing (${spacing.map((s) => s.toFixed(2)).join(" × ")} mm).`));
  if (header.qform_code === 0 && header.sform_code === 0)
    issues.push(warn("no_orientation", "Header has neither qform nor sform; orientation is ambiguous."));
  const det = det3(affine);
  if (det > 0) issues.push(warn("orientation", "Affine has positive determinant (radiological/mirrored storage). The backend reorients to a canonical frame."));

  let img: ArrayBuffer;
  try {
    img = nifti.readImage(header, data);
  } catch {
    issues.push(err("unreadable", "Image data could not be read."));
    return base;
  }
  const arr = typedFor(header.datatypeCode, img);
  if (!arr) {
    issues.push(err("datatype", `Unsupported NIfTI datatype code ${header.datatypeCode}.`));
    return base;
  }
  const expected = shape[0] * shape[1] * shape[2];
  if (arr.length < expected) {
    issues.push(err("truncated", "Image data is shorter than the header dimensions."));
    return base;
  }
  const slope = header.scl_slope || 1;
  const inter = header.scl_inter || 0;
  let min = Infinity,
    max = -Infinity,
    nonFinite = 0;
  for (let i = 0; i < expected; i++) {
    const v = Number(arr[i]) * slope + inter;
    if (!Number.isFinite(v)) {
      nonFinite++;
      continue;
    }
    if (v < min) min = v;
    if (v > max) max = v;
  }
  base.stats = { min, max, nonFinite };
  if (nonFinite > 0) issues.push(err("non_finite", `${nonFinite.toLocaleString()} voxels contain NaN or infinite values.`));
  if (min === max) issues.push(err("constant", "Volume is constant; it contains no image information."));
  if (opts.isMask && (min < 0 || !Number.isInteger(max)))
    issues.push(err("mask_labels", "Expert mask must contain non-negative integer labels."));
  base.valid = !issues.some((i) => i.level === "error");
  return base;
}

export async function validateNiftiFile(file: File, opts: { isMask?: boolean } = {}): Promise<FileValidation> {
  if (!hasNiftiExtension(file.name))
    return { fileName: file.name, sizeBytes: file.size, issues: [err("extension", "Only .nii and .nii.gz files are accepted.")], valid: false };
  if (file.size > MAX_FILE_BYTES)
    return { fileName: file.name, sizeBytes: file.size, issues: [err("too_large", "File exceeds the 1 GB limit.")], valid: false };
  const buf = await file.arrayBuffer();
  return validateNiftiBuffer(file.name, file.size, buf, opts);
}

/** Within-study geometry check: all sequences must share shape and affine. */
export function checkStudyGeometry(geoms: { seq: string; geometry?: VolumeGeometry }[]): ValidationIssue[] {
  const withG = geoms.filter((g) => g.geometry);
  if (withG.length < 2) return [];
  const ref = withG[0];
  const issues: ValidationIssue[] = [];
  for (const g of withG.slice(1)) {
    if (g.geometry!.shape.join() !== ref.geometry!.shape.join())
      issues.push(err("shape_mismatch", `${g.seq} shape [${g.geometry!.shape}] differs from ${ref.seq} [${ref.geometry!.shape}]. Sequences must be co-registered.`));
    else if (!affinesClose(g.geometry!.affine, ref.geometry!.affine))
      issues.push(err("affine_mismatch", `${g.seq} affine differs from ${ref.seq}. Sequences within a study must share the same geometry.`));
  }
  return issues;
}

export function affinesClose(a: Affine, b: Affine, tol = 1e-3): boolean {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (Math.abs((a[i]?.[j] ?? 0) - (b[i]?.[j] ?? 0)) > tol) return false;
  return true;
}

function det3(m: Affine) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function typedFor(code: number, buf: ArrayBuffer): ArrayLike<number> | null {
  switch (code) {
    case 2: return new Uint8Array(buf);
    case 4: return new Int16Array(buf);
    case 8: return new Int32Array(buf);
    case 16: return new Float32Array(buf);
    case 64: return new Float64Array(buf);
    case 256: return new Int8Array(buf);
    case 512: return new Uint16Array(buf);
    case 768: return new Uint32Array(buf);
    default: return null;
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
