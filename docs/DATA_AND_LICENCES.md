# Data, Model Resources and Licences

## Used
| Resource | Role | Location | Status |
|---|---|---|---|
| BraTS 2023 GLI training data (1251 scans) | Training, validation and held-out development evaluation | `data/raw/` (13 GB, already present before this work) | Used. Not modified. |
| MONAI (Apache-2.0) | Network, transforms and sliding-window code | pip | Used |
| NiiVue (BSD-2-Clause) | Browser viewer | npm | Used |

## Checked, not used
| Resource | Finding |
|---|---|
| Organiser 40-case BraTS 2021 development subset | **Not found locally.** The owner needs to supply the organiser link or files. |
| BraTS 2021 (TCIA / CBICA) | Not downloaded; the full collection is not needed. Its training patients are the same as BraTS 2023 GLI training patients (see eligibility below). |
| Medical Segmentation Decathlon Task01_BrainTumour (about 7 GB) | Not downloaded and not needed: the local data already covers development. MSD uses BraTS 2016/2017 cases with a different channel order (FLAIR, T1w, T1gd, T2w) and different labels. |
| MONAI `brats_mri_segmentation` bundle (SegResNet, trained on BraTS 2018) | Not downloaded. The existing checkpoint works with the corrected pipeline. The bundle would have the same overlap question, because BraTS 2018 cases are in BraTS 2021. |

## Hidden-case policy
No hidden judging case was used for training, tuning or testing. Every threshold and rule was fixed before evaluation:
- Probability threshold: 0.5.
- Refinement: 10 mm³.
- Sanity ranges: taken from training cases only.

## Citations
- **BraTS 2021 (organiser-specified):** U. Baid et al., "The RSNA-ASNR-MICCAI BraTS 2021 Benchmark on Brain Tumor Segmentation and Radiogenomic Classification", arXiv:2107.02314. TCIA dataset DOI **10.7937/jc8x-9874**.
- B. H. Menze et al., "The Multimodal Brain Tumor Image Segmentation Benchmark (BRATS)", IEEE TMI 34(10), 2015.
- S. Bakas et al., "Advancing The Cancer Genome Atlas glioma MRI collections with expert segmentation labels and radiomic features", Scientific Data 4, 170117, 2017.
- MONAI Consortium, "MONAI: Medical Open Network for AI" (Apache-2.0).
- MSD (if used in future): M. Antonelli et al., "The Medical Segmentation Decathlon", Nature Communications 13, 4128, 2022 (CC BY-SA 4.0).

Before redistributing any data or derived weights, check the current licence terms on the official BraTS/Synapse and TCIA pages.
