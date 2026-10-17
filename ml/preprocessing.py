from monai.transforms import (
    Compose,
    LoadImaged,
    EnsureChannelFirstd,
    Spacingd,
    Orientationd,
    NormalizeIntensityd,
    RandCropByPosNegLabeld,
    RandFlipd,
    RandRotate90d,
    ToTensord,
    MapTransform,
)
import torch

class ConvertBraTS2023ToMultiChanneld(MapTransform):
    """
    Custom transform for BraTS 2023 GLI challenge labels.
    Original labels: 0=Background, 1=NCR/NET, 2=ED, 3=ET
    Outputs 3 channels:
        Channel 0: TC (Tumor Core) = labels 1 OR 3
        Channel 1: WT (Whole Tumor) = labels 1 OR 2 OR 3
        Channel 2: ET (Enhancing Tumor) = label 3
    """
    def __call__(self, data):
        d = dict(data)
        for key in self.keys:
            label = d[key]
            
            result = []
            # TC = 1 or 3
            result.append(torch.logical_or(label == 1, label == 3))
            # WT = 1 or 2 or 3
            result.append(
                torch.logical_or(
                    torch.logical_or(label == 1, label == 2),
                    label == 3
                )
            )
            # ET = 3
            result.append(label == 3)
            
            # Stack creates the channel dimension [3, H, W, D]
            d[key] = torch.stack(result, dim=0).float()
            
        return d

def get_train_transforms():
    """
    Returns the training preprocessing pipeline.
    Expects input dictionary format: {"image": [path1, path2...], "label": path}
    """
    return Compose([
        LoadImaged(keys=["image", "label"]),
        ConvertBraTS2023ToMultiChanneld(keys="label"),
        EnsureChannelFirstd(keys="image"),
        Orientationd(keys=["image", "label"], axcodes="RAS"),
        Spacingd(keys=["image", "label"], pixdim=(1.0, 1.0, 1.0), mode=("bilinear", "nearest")),
        NormalizeIntensityd(keys="image", nonzero=True, channel_wise=True),
        RandCropByPosNegLabeld(
            keys=["image", "label"],
            label_key="label",
            spatial_size=(128, 128, 128),
            pos=1,
            neg=1,
            num_samples=2,
            image_key="image",
            image_threshold=0,
        ),
        RandFlipd(keys=["image", "label"], prob=0.5, spatial_axis=0),
        RandFlipd(keys=["image", "label"], prob=0.5, spatial_axis=1),
        RandRotate90d(keys=["image", "label"], prob=0.5, max_k=3),
        ToTensord(keys=["image", "label"]),
    ])

def get_val_transforms():
    """
    Returns the validation preprocessing pipeline.
    """
    return Compose([
        LoadImaged(keys=["image", "label"]),
        ConvertBraTS2023ToMultiChanneld(keys="label"),
        EnsureChannelFirstd(keys="image"),
        Orientationd(keys=["image", "label"], axcodes="RAS"),
        Spacingd(keys=["image", "label"], pixdim=(1.0, 1.0, 1.0), mode=("bilinear", "nearest")),
        NormalizeIntensityd(keys="image", nonzero=True, channel_wise=True),
        ToTensord(keys=["image", "label"]),
    ])
