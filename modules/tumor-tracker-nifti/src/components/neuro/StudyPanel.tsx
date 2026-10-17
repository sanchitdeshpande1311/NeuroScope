import { AlertCircle, CheckCircle2, FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { formatBytes, guessSequence, validateNiftiFile, checkStudyGeometry } from "@/lib/neuro/nifti-validate";
import { SEQUENCES, type FileValidation, type Sequence, type StudyDraft } from "@/lib/neuro/types";
import { Input } from "@/components/ui/input";

interface Props {
  study: StudyDraft;
  onChange: (s: StudyDraft) => void;
  title: string;
}

export function StudyPanel({ study, onChange, title }: Props) {
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const dropRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [unassigned, setUnassigned] = useState<string[]>([]);

  const setBusyKey = (k: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      on ? n.add(k) : n.delete(k);
      return n;
    });

  async function assign(seq: Sequence, file: File, base: StudyDraft) {
    setBusyKey(seq, true);
    const v = await validateNiftiFile(file).catch(
      (e): FileValidation => ({
        fileName: file.name,
        sizeBytes: file.size,
        valid: false,
        issues: [{ level: "error", code: "unreadable", message: String(e?.message ?? e) }],
      })
    );
    setBusyKey(seq, false);
    return { ...base, files: { ...base.files, [seq]: file }, validation: { ...base.validation, [seq]: v } };
  }

  async function addMany(files: FileList | File[]) {
    let next = study;
    const left: string[] = [];
    for (const f of Array.from(files)) {
      const g = guessSequence(f.name);
      if (g && !next.files[g]) next = await assign(g, f, next);
      else left.push(f.name);
    }
    setUnassigned(left);
    onChange(next);
  }

  function remove(seq: Sequence) {
    const files = { ...study.files };
    delete files[seq];
    const validation = { ...study.validation };
    delete validation[seq];
    onChange({ ...study, files, validation });
  }

  function move(from: Sequence, to: Sequence) {
    if (from === to) return;
    const files = { ...study.files },
      validation = { ...study.validation };
    const [fa, va, fb, vb] = [files[from], validation[from], files[to], validation[to]];
    if (fb) {
      files[from] = fb;
      validation[from] = vb;
    } else {
      delete files[from];
      delete validation[from];
    }
    files[to] = fa;
    validation[to] = va;
    onChange({ ...study, files, validation });
  }

  const geomIssues = checkStudyGeometry(SEQUENCES.map((s) => ({ seq: s, geometry: study.validation[s]?.geometry })));

  return (
    <div className="panel flex flex-col rounded-2xl border border-primary/25 bg-card/95 p-6 shadow-2xl backdrop-blur-md">
      {/* Header with Title and Validation Badge */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-primary">MRI Scan Series</span>
          <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-white">{title}</h2>
        </div>
        <StudyBadge study={study} geomErrors={geomIssues.length} />
      </div>

      {/* Label and Date Inputs */}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="text-sm font-semibold tracking-wide text-foreground/90">
          Study Label
          <Input
            className="mt-1.5 h-11 rounded-xl border-border/80 bg-black/40 px-3.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary"
            value={study.label}
            placeholder="e.g. Baseline (Pre-op)"
            onChange={(e) => onChange({ ...study, label: e.target.value })}
          />
        </label>
        <label className="text-sm font-semibold tracking-wide text-foreground/90">
          Study Date
          <Input
            className="mt-1.5 h-11 rounded-xl border-border/80 bg-black/40 px-3.5 text-base text-foreground focus:border-primary"
            type="date"
            value={study.date}
            onChange={(e) => onChange({ ...study, date: e.target.value })}
          />
        </label>
      </div>

      {/* Spacious Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addMany(e.dataTransfer.files);
        }}
        onClick={() => dropRef.current?.click()}
        className={`mt-5 cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-all ${
          drag
            ? "border-primary bg-primary/15 shadow-[0_0_25px_rgba(255,51,102,0.25)]"
            : "border-primary/30 bg-primary/[0.03] hover:border-primary/70 hover:bg-primary/[0.07]"
        }`}
      >
        <FileUp className="mx-auto h-8 w-8 text-primary transition-transform hover:scale-110" />
        <div className="mt-3 text-base font-bold text-white sm:text-lg">
          Drop T1, T1Gd, T2, and FLAIR volumes here
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Supports <span className="font-mono text-white/90">.nii</span> or{" "}
          <span className="font-mono text-white/90">.nii.gz</span> · Max 1 GB per file · Sequences auto-assigned from
          filename
        </div>
        <input
          ref={dropRef}
          type="file"
          multiple
          accept=".nii,.gz,.nii.gz,application/gzip,application/x-gzip,*"
          className="hidden"
          onChange={(e) => e.target.files && addMany(e.target.files)}
        />
      </div>

      {unassigned.length > 0 && (
        <p className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
          Could not auto-assign: <span className="font-mono">{unassigned.join(", ")}</span>. Please assign them below.
        </p>
      )}

      {/* Sequence Slots */}
      <div className="mt-5 space-y-2.5">
        {SEQUENCES.map((seq) => (
          <Slot
            key={seq}
            seq={seq}
            file={study.files[seq]}
            v={study.validation[seq]}
            busy={busy.has(seq)}
            onPick={async (f) => onChange(await assign(seq, f, study))}
            onRemove={() => remove(seq)}
            onMove={(to) => move(seq, to)}
          />
        ))}
      </div>

      {geomIssues.map((i) => (
        <p key={i.message} className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          {i.message}
        </p>
      ))}

    </div>
  );
}

function StudyBadge({ study, geomErrors }: { study: StudyDraft; geomErrors: number }) {
  const n = SEQUENCES.filter((s) => study.validation[s]?.valid).length;
  const anyErr = SEQUENCES.some((s) => study.validation[s] && !study.validation[s]!.valid) || geomErrors > 0;

  if (anyErr) {
    return (
      <span className="rounded-full border border-rose-500/40 bg-rose-950/30 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-rose-400">
        Errors Detected
      </span>
    );
  }

  return (
    <span
      className={`rounded-full border px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
        n === 4
          ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
          : "border-border/80 bg-black/40 text-muted-foreground"
      }`}
    >
      {n} / 4 Valid
    </span>
  );
}

function Slot({
  seq,
  file,
  v,
  busy,
  onPick,
  onRemove,
  onMove,
}: {
  seq: Sequence;
  file?: File;
  v?: FileValidation;
  busy: boolean;
  onPick: (f: File) => void;
  onRemove: () => void;
  onMove: (to: Sequence) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const errors = v?.issues.filter((i) => i.level === "error") ?? [];
  const warns = v?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.tagName !== "SELECT" &&
          target.tagName !== "BUTTON" &&
          !target.closest("button") &&
          !target.closest("select")
        ) {
          ref.current?.click();
        }
      }}
      className="cursor-pointer rounded-xl border border-border/70 bg-black/40 p-3.5 transition-all hover:border-primary/60 hover:bg-black/60"
    >
      <div className="flex items-center gap-3.5">
        <span className="w-16 font-mono text-base font-bold text-primary">{seq}</span>
        <div className="min-w-0 flex-1">
          {file ? (
            <>
              <div className="truncate text-base font-semibold text-white">{file.name}</div>
              <div className="mt-0.5 font-mono text-sm text-muted-foreground">
                {formatBytes(file.size)}
                {v?.geometry && ` · ${v.geometry.shape.join("×")} voxels · ${v.geometry.spacing.map((s) => s.toFixed(2)).join("×")} mm`}
              </div>
            </>
          ) : (
            <div className="text-base font-medium text-muted-foreground/80">
              Missing sequence — click or drop to add
            </div>
          )}
        </div>

        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : v ? (
          v.valid ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400" />
          )
        ) : null}

        {file && (
          <select
            aria-label={`Reassign ${seq}`}
            value={seq}
            onChange={(e) => onMove(e.target.value as Sequence)}
            className="rounded-lg border border-border bg-black/60 px-2 py-1 font-mono text-xs text-foreground focus:border-primary"
          >
            {SEQUENCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
          aria-label={file ? `Replace ${seq}` : `Add ${seq}`}
        >
          {file ? <RefreshCw className="h-4.5 w-4.5" /> : <FileUp className="h-4.5 w-4.5" />}
        </button>

        {file && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
            aria-label={`Remove ${seq}`}
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        )}

        <input
          ref={ref}
          type="file"
          accept=".nii,.gz,.nii.gz,application/gzip,application/x-gzip,*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
      </div>

      {[...errors, ...warns].map((i) => (
        <p
          key={i.code + i.message}
          className={`mt-2 pl-19 text-sm ${i.level === "error" ? "text-rose-400" : "text-amber-300"}`}
        >
          {i.message}
        </p>
      ))}
    </div>
  );
}

function ExpertMask({ study, onChange }: { study: StudyDraft; onChange: (s: StudyDraft) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const v = study.expertMaskValidation;

  return (
    <div className="mt-2.5 flex items-center gap-3.5 text-sm">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="rounded-xl border border-border/80 bg-black/30 px-3.5 py-1.5 text-sm font-medium text-foreground transition-all hover:border-primary hover:text-white"
      >
        {study.expertMask ? "Replace mask" : "Add mask"}
      </button>

      {study.expertMask && (
        <>
          <span className="truncate font-mono text-sm text-foreground/90">{study.expertMask.name}</span>
          <span
            className={`font-mono text-xs font-semibold ${
              v?.valid ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {v?.valid ? "valid" : v?.issues[0]?.message}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...study, expertMask: undefined, expertMaskValidation: undefined })}
            className="text-muted-foreground hover:text-rose-400"
            aria-label="Remove expert mask"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}

      <input
        ref={ref}
        type="file"
        accept=".nii,.gz,.nii.gz,application/gzip,application/x-gzip,*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const vv = await validateNiftiFile(f, { isMask: true });
          onChange({ ...study, expertMask: f, expertMaskValidation: vv });
        }}
      />
    </div>
  );
}

export function studyReady(s: StudyDraft): string[] {
  const problems: string[] = [];
  if (!s.date) problems.push("Study date is missing");
  if (!s.label.trim()) problems.push("Study label is missing");
  const missing = SEQUENCES.filter((q) => !s.files[q]);
  if (missing.length) problems.push(`Missing sequences: ${missing.join(", ")}`);
  const invalid = SEQUENCES.filter((q) => s.validation[q] && !s.validation[q]!.valid);
  if (invalid.length) problems.push(`Invalid files: ${invalid.join(", ")}`);
  if (checkStudyGeometry(SEQUENCES.map((q) => ({ seq: q, geometry: s.validation[q]?.geometry }))).length)
    problems.push("Sequence geometry mismatch across MRI channels");
  if (s.expertMask && !s.expertMaskValidation?.valid) problems.push("Expert mask is invalid");
  return problems;
}
