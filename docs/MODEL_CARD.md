# Model Card — NeuroScope3D-UNet

## Intended use
Research and teaching demonstrations of automated glioma sub-region segmentation on four co-registered, skull-stripped 3D MRI sequences (T1, T1Gd, T2, FLAIR). **It is not a medical device.** It must not be used for diagnosis, prognosis or treatment decisions, and it does not replace a radiologist.

## Model
- Architecture: `monai.networks.nets.UNet(spatial_dims=3, in_channels=4, out_channels=3, channels=(16,32,64,128,256), strides=(2,2,2,2), num_res_units=2)`, about 4.8 M parameters (19.3 MB checkpoint).
- Weights: `models/baseline_checkpoints/best_metric_model.pth`, SHA-256 prefix `2decff1363f7861e` (full hash in every `result.json`).
- Other checkpoint files are kept but not used: `best_metric_model_epoch13_backup.pth` and `final_epoch_model.pth`.
- Input channel order: 0 = T1 (`t1n`), 1 = T1Gd (`t1c`), 2 = T2 (`t2w`), 3 = FLAIR (`t2f`).
- Output: 3 sigmoid channels, 0 = TC, 1 = WT, 2 = ET (multi-label, nested regions).

## Training (provenance from the project's own scripts; no external weights)
- Data: BraTS 2023 Adult Glioma (GLI) training data, 1251 scans, stored locally in `data/raw`.
- Split: `scripts/04_make_subject_split.py`, seed 42, 875 train / 187 val / 189 test.
  - The split was made per scan, not per patient. 21 train/test and 22 train/val patients overlap.
  - Evaluation therefore uses only the 163 test patients who are absent from train and val (`configs/heldout_cases.json`).
- Training: Dice loss (sigmoid), Adam lr 1e-4, cosine schedule, 50 epochs (resumed from epoch 13; `scripts/09_resume_baseline_gpu.py`), 128³ random crops with flips and rot90, AMP on an RTX 3050.
- Preprocessing used in training **and now identically in inference**: Orientation RAS → Spacing 1.0 mm (bilinear) → NormalizeIntensity (non-zero voxels, per channel).
  - The original API used min-max scaling without reorientation or resampling. This was fixed in `ml/inference.py`.

## Inference and output
- Inference: sliding window over 128³ ROIs, overlap 0.25, fp32, deterministic cuDNN.
- Resampling: sigmoid probabilities are resampled trilinearly back to the **original T1Gd grid** using both affines, then thresholded at 0.5. The threshold was not tuned.
- Label mapping: ET → 4, TC \ ET → 1 (NCR/NET), WT \ TC → 2 (edema). The hierarchy is enforced upward: ET implies TC, which implies WT.
- Output file: uint8 NIfTI with the original affine and qform/sform. It is reopened and checked after writing.

## Evaluation (development data, NOT hidden-case performance)
30 patient-disjoint held-out BraTS 2023 GLI cases (`results/heldout_eval.json`):

| | WT | TC | ET |
|---|---|---|---|
| Dice (mean) | 0.875 | 0.833 | 0.810 |
| Sensitivity (mean) | 0.921 | 0.904 | 0.853 |

These figures were re-run on 2026-10-16 with the current code and reproduced exactly.

**Optional refinement** (removes WT components smaller than 10 mm³; not tuned), measured on the same 30 cases (`results/refinement_eval_summary.json`):
- Mean Dice change: WT +0.0008, TC 0, ET 0.
- WT cases improved / worse / unchanged (|ΔDice| ≤ 0.001 counts as unchanged): 7 / 0 / 23.
- WT voxel totals: false positives −1.41 %, false negatives +0.01 %.

This is not a meaningful change, so the unrefined prediction remains the primary output.

The organiser's baseline was not available, so no comparison is claimed. The earlier figure of "0.81 test Dice" in `results/baseline_metrics.json` came from the patient-overlapping split with mismatched API preprocessing. It should not be cited.

## Eligibility and licence: open questions
- **Data overlap:** BraTS 2023 GLI training data contains the BraTS 2021 training patients (relabelled ET 4 → 3). If the hidden judging cases come from BraTS 2021 training data, some of them may have been in this model's training set. The organiser must rule on this.
- **Licences:** the weights were trained by the project team, and no separate licence has been issued yet; the owner should choose one. The code depends on MONAI (Apache-2.0). Use of the training data follows the BraTS data-use terms and citation requirements (see `docs/DATA_AND_LICENCES.md`).
- **Pre-hackathon availability:** the checkpoint files are dated 2026-09-09 on disk. No public release of these weights is documented.

## Known failure modes
- False-positive or over-predicted enhancing tumour when the expert reference has little or no ET.
  - Blind case: 6.0 mL predicted, median ET probability 0.955, 65% of it inside the expert NCR.
  - Two development cases with < 3 mL expert ET were over-predicted.
  - This is a model limitation, not a label-mapping error. See docs/TEST_RESULTS.md.
- Artificial bright spots on T1Gd are labelled as enhancing tumour (seen with the synthetic marker).
- Inputs that are not skull-stripped, not co-registered or not adult pre-operative glioma are out of distribution. The heuristic sanity check refuses clear cases only.
