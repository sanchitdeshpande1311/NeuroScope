# Commit Plan (proposed, NOT executed)

State on 2026-10-16:
- Branch `master`. The repository has **no commits**; every file is untracked.
- No changes have been discarded.
- `.gitignore` already excludes: `venv/`, `node_modules/`, `.next/`, `data/raw/`, `data/processed/`, `*.nii`, `*.nii.gz`, `backend/runs/`, `backend/temp/`, `backend/results/`, `models/**/*.pth`, `.env*`, `.tmp/` and `BACKUP_MANIFEST.json`.
- `git check-ignore` confirms that `.env`, the checkpoints, `backend/runs`, `data/raw`, `.tmp` and `venv` are ignored.
- Secrets scan (API key / token / password patterns) found nothing. `.env` contains only a comment.

## Decisions needed from the owner before committing

1. **`frontend/` is its own git repository** (`frontend/.git`, from create-next-app, one commit `f6d422b`).
   - If you run `git add frontend` at the root, git records only a pointer to that repository, not the frontend code.
   - **Recommended:** move `frontend/.git` out to `C:\Users\hp\NeuroScope3D_backups\frontend_git_20261016`. This is reversible, and afterwards the root repository tracks the frontend source normally.
   - Alternative: keep it as a separate repository or submodule.
2. **`skill-creator/`** (18 files, a Claude skill toolkit with its own LICENSE.txt) is not part of the app. Recommended: leave it out of the commit, or add it to `.gitignore`.
3. **`.claude/launch.json`** contains absolute paths specific to this machine. Recommended: leave it out.
4. **Derived BraTS outputs in `results/sample_run_BraTS-GLI-00360-000/`** (PDF with slice images, meshes, result.json). These come from BraTS data. Commit them only if the BraTS data-use terms allow redistributing derived images. Recommended: commit `result.json` only, or nothing, until that is checked.
5. **Model weights** (`models/**/*.pth`, 19 MB) are ignored. If the judges need them, either use Git LFS or a release asset with the SHA-256 from `docs/MODEL_CARD.md`, after the licence/eligibility question is settled.

## Proposed commits (after the decisions above)

| # | Message | Contents |
|---|---|---|
| 1 | `chore: project scaffolding and ignore rules` | `.gitignore`, `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `requirements.txt`, `start.ps1` |
| 2 | `feat(ml): validated geometry-correct inference pipeline` | `ml/` (inference, pipeline, graph_analysis, meshes, report + existing training modules), `configs/` |
| 3 | `feat(api): FastAPI with validation, run isolation and retention` | `backend/main.py` |
| 4 | `feat(ui): multi-page app — upload validation, full-screen viewer, graph, refinement, expert, report` | `frontend/src/**`: `app/page.tsx`, `app/upload/`, `app/runs/[id]/**`, `components/`, `lib/`, `globals.css`, `layout.tsx`; `package.json`, `package-lock.json`. Exclude `node_modules`, `.next` and `public/__testdata__` (already removed). |
| 5 | `test: judging-challenge, pipeline and UI-backend tests` | `tests/` (35 tests) |
| 6 | `chore: execution tools and original data scripts` | `execution/`, `scripts/`, `metadata/`, `data/splits/` |
| 7 | `docs: model card, test results, licences, evidence` | `docs/`, `results/*.json`, `results/*.md`, `CLAUDE_PROGRESS_HANDOFF.txt` |

Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Before committing, run:
- `git status --porcelain -uall`, and check that no `.nii*`, `.pth` or `backend/runs` path appears;
- the test suite.
