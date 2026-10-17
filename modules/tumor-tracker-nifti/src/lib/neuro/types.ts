// Typed data model + API contract for the NeuroScope Tumour Change Tracker.
// Studies are an ordered list so more than two time points can be added later.

export type Sequence = "T1" | "T1Gd" | "T2" | "FLAIR";
export const SEQUENCES: Sequence[] = ["T1", "T1Gd", "T2", "FLAIR"];
export type Region = "WT" | "TC" | "ET";
export const REGIONS: Region[] = ["WT", "TC", "ET"];
export const REGION_NAMES: Record<Region, string> = {
  WT: "Whole tumour",
  TC: "Tumour core",
  ET: "Enhancing tumour",
};

export type Vec3 = [number, number, number];
/** Row-major 4x4 voxel->world (RAS/LPS as reported by the header) affine. */
export type Affine = number[][];

export interface VolumeGeometry {
  shape: Vec3;
  spacing: Vec3; // mm
  affine: Affine;
}

export type ValidationLevel = "ok" | "warning" | "error";
export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
}

export interface FileValidation {
  fileName: string;
  sizeBytes: number;
  geometry?: VolumeGeometry;
  stats?: { min: number; max: number; nonFinite: number };
  issues: ValidationIssue[];
  valid: boolean;
}

export type StudyRole = "previous" | "current";

export interface StudyDraft {
  role: StudyRole;
  label: string;
  date: string; // ISO yyyy-mm-dd
  files: Partial<Record<Sequence, File>>;
  validation: Partial<Record<Sequence, FileValidation>>;
  expertMask?: File;
  expertMaskValidation?: FileValidation;
}

export interface RegionVolume {
  voxels: number;
  voxelVolumeMm3: number;
  volumeMl: number;
}
export type RegionVolumes = Record<Region, RegionVolume>;

export type PipelineStage =
  | "uploaded"
  | "validating"
  | "comparability_check"
  | "segmenting_previous"
  | "segmenting_current"
  | "validating_segmentation"
  | "registering"
  | "resampling"
  | "volumes"
  | "change_map"
  | "visualization"
  | "report"
  | "complete"
  | "failed";

export const PIPELINE_STAGES: { id: PipelineStage; label: string }[] = [
  { id: "uploaded", label: "Upload both studies" },
  { id: "validating", label: "Validate files and metadata" },
  { id: "comparability_check", label: "Verify studies are comparable" },
  { id: "segmenting_previous", label: "Segment previous study" },
  { id: "segmenting_current", label: "Segment current study" },
  { id: "validating_segmentation", label: "Validate segmentation outputs" },
  { id: "registering", label: "Register studies" },
  { id: "resampling", label: "Resample masks (nearest-neighbour)" },
  { id: "volumes", label: "Calculate volumes" },
  { id: "change_map", label: "Generate change maps" },
  { id: "visualization", label: "Prepare 3D and slice views" },
  { id: "report", label: "Generate report" },
];

export interface ComparisonStatus {
  comparison_id: string;
  stage: PipelineStage;
  /** Only present when the backend reports a real fraction. */
  progress?: number;
  error?: { code: string; message: string; retryable: boolean };
  warnings: string[];
  updated_at: string;
}

export interface ModelInfo {
  name: string;
  version: string;
  licence: string;
  weights_loaded: boolean;
  input_order: Sequence[];
  output_channels: Region[];
  device?: string;
}

export interface HealthResponse {
  status: "ok" | "setup_required";
  model: ModelInfo | null;
  registration_backend: string | null;
  messages: string[];
}

export interface RegistrationInfo {
  method: string;
  fixed: string;
  moving: string;
  transform: string;
  settings: Record<string, string | number>;
  metrics: Record<string, number>;
  quality: "pass" | "warning" | "fail";
  warnings: string[];
}

export interface StudySummary {
  study_id: string;
  role: StudyRole;
  label: string;
  date: string;
  validation: { sequence: Sequence; file_name: string; valid: boolean; issues: ValidationIssue[] }[];
  input_hashes: Record<string, string>;
  volumes: RegionVolumes | null;
  expert_volumes?: RegionVolumes | null;
  segmentation_status: "complete" | "failed" | "pending";
}

/**
 * Compact visualization payload in the common (previous-study) reference space.
 * `masks` is base64 uint8, one byte per voxel, x fastest:
 *   bit0 prev WT, bit1 prev TC, bit2 prev ET, bit3 cur WT, bit4 cur TC, bit5 cur ET
 * `background_*` are base64 uint8 intensity images (0-255) for slice context.
 */
export interface VisualizationGrid {
  shape: Vec3;
  spacing: Vec3;
  affine: Affine;
  masks: string;
  background_previous?: string;
  background_current?: string;
}

export type LongitudinalCategory =
  | "marked_improvement"
  | "partial_improvement"
  | "stable_disease"
  | "progression"
  | "new_lesion"
  | "edema_expansion"
  | "indeterminate";

export type RiskLevel = "low" | "moderate" | "high" | "indeterminate";
export type BettermentStatus = "significant_improvement" | "partial_improvement" | "stable" | "progression" | "indeterminate";

export interface SubregionAssessment {
  region: Region;
  name: string;
  previousMl: number;
  currentMl: number;
  deltaMl: number;
  deltaPercent: number | null;
  trend: "decreasing" | "increasing" | "stable" | "new" | "absent";
  summary: string;
}

export interface RiskFactor {
  title: string;
  level: "low" | "moderate" | "high";
  details: string;
}

export interface LongitudinalAssessment {
  category: LongitudinalCategory;
  bettermentStatus: BettermentStatus;
  bettermentHeadline: string;
  isImprovement: boolean;
  riskLevel: RiskLevel;
  riskLabel: string;
  summary: string;
  clinicalInterpretation: string;
  subregions: SubregionAssessment[];
  riskFactors: RiskFactor[];
  keyFindings: string[];
  criteriaReference: string;
}

export interface ComparisonResults {
  comparison_id: string;
  studies: StudySummary[]; // ordered by date
  model: ModelInfo;
  assessment?: LongitudinalAssessment;
  preprocessing: string[];
  registration: RegistrationInfo;
  grid: VisualizationGrid | null;
  warnings: string[];
  limitations: string[];
  processed_at: string;
}

export const DISCLAIMER =
  "Research and teaching prototype only. Displays model-predicted regions and estimated volumetric changes. Not for diagnosis, treatment decisions or clinical use.";

export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
