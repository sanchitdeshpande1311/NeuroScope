# Questions for the organisers (draft — not sent)

Subject: NeuroScope 3D — model eligibility, training-data overlap, and development files

Hello,

We are submitting NeuroScope 3D. We need your guidance on three points.

1. **Eligibility of our checkpoint.**
   - Our segmentation model is a MONAI 3D U-Net that we trained ourselves on the public **BraTS 2023 Adult Glioma (GLI) training set**: 875 training scans, with separate validation and test scans held out.
   - No external pretrained weights were used.
   - Is a model trained on this data eligible?
2. **Possible overlap with the hidden cases.**
   - The BraTS 2023 GLI training cohort includes the BraTS 2021 training patients.
   - If the hidden evaluation cases come from the BraTS 2021 training collection, some of them may be in our training data.
   - We have not tried to identify the hidden cases. Can you confirm whether they come from that collection?
   - If they do, would you prefer that we submit a model trained without specific cases, or is the overlap acceptable?
3. **Development files.**
   - Please send the link or access instructions for the **40-case BraTS 2021 development subset**.
   - Please also send the **baseline Dice and sensitivity values** for WT, TC and ET on those cases (or the baseline outputs/script), so we can compare on the same cases.
   - Also: are the hidden-case labels in the BraTS 2021 convention (0/1/2/4)?

Our pipeline's output format: a NIfTI with labels 1 = NCR/NET, 2 = edema, 4 = enhancing tumour, on the input grid with the input affine.

Thank you.
