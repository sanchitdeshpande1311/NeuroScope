import networkx as nx
import numpy as np
import torch
from scipy.ndimage import label, center_of_mass, find_objects, binary_dilation

class BraTSGraphBuilder:
    def __init__(self, adjacency_threshold=2.0, proximity_threshold=50.0):
        """
        adjacency_threshold: Distance in voxels to consider two components structurally adjacent.
        proximity_threshold: Euclidean distance between centroids to consider a proximity edge.
        """
        self.adjacency_threshold = adjacency_threshold
        self.proximity_threshold = proximity_threshold

    def _compute_surface_distance_approx(self, mask1, mask2):
        """
        Approximates if two binary masks are adjacent by dilating mask1 and checking intersection.
        Returns True if adjacent, False otherwise.
        """
        # A simple morphological dilation by 1 voxel (or more based on adjacency_threshold)
        dilated_mask1 = binary_dilation(mask1, iterations=int(self.adjacency_threshold))
        intersection = np.logical_and(dilated_mask1, mask2)
        return np.any(intersection)

    def _get_channel_name(self, idx):
        return {0: "TC", 1: "WT", 2: "ET"}.get(idx, f"CH_{idx}")

    def build_graph(self, image_tensor: torch.Tensor, label_tensor: torch.Tensor) -> nx.Graph:
        """
        image_tensor: [4, H, W, D]  (t1n, t1c, t2w, t2f) - the model input order
        label_tensor: [3, H, W, D]  (TC, WT, ET)
        """
        image_np = image_tensor.detach().cpu().numpy()
        label_np = label_tensor.detach().cpu().numpy()
        
        G = nx.Graph()
        
        # Track components for edge building
        # List of dicts: {"node_id": id, "mask": binary_mask, "centroid": (x,y,z), "class": "TC"}
        components = []
        node_counter = 0
        
        # 1. Node Extraction
        for c_idx in range(label_np.shape[0]):
            class_name = self._get_channel_name(c_idx)
            binary_mask = (label_np[c_idx] > 0.5).astype(int)
            
            # Find 3D connected components (26-connectivity)
            labeled_array, num_features = label(binary_mask, structure=np.ones((3, 3, 3)))
            
            if num_features == 0:
                continue
                
            # Get bounding boxes for each component
            slices = find_objects(labeled_array)
            
            for i in range(1, num_features + 1):
                comp_mask = (labeled_array == i)
                
                # Volume
                volume = int(np.sum(comp_mask))
                
                # Centroid
                centroid = center_of_mass(comp_mask)
                
                # Bounding box volume
                comp_slices = slices[i-1]
                bbox_dims = [s.stop - s.start for s in comp_slices]
                bbox_volume = int(np.prod(bbox_dims))
                
                # Mean intensities
                mean_intensities = []
                for img_c in range(image_np.shape[0]):
                    mean_val = float(np.mean(image_np[img_c][comp_mask]))
                    mean_intensities.append(mean_val)
                
                node_id = f"N{node_counter}"
                
                # Add Node
                G.add_node(
                    node_id,
                    class_type=class_name,
                    volume=volume,
                    centroid=centroid,
                    bbox_volume=bbox_volume,
                    mean_t1n=mean_intensities[0],
                    mean_t1c=mean_intensities[1],
                    mean_t2w=mean_intensities[2],
                    mean_t2f=mean_intensities[3]
                )
                
                components.append({
                    "node_id": node_id,
                    "mask": comp_mask,
                    "centroid": np.array(centroid),
                    "class": class_name,
                    "bbox_slices": comp_slices
                })
                
                node_counter += 1

        # 2. Edge Creation
        num_comp = len(components)
        for i in range(num_comp):
            for j in range(i + 1, num_comp):
                c1 = components[i]
                c2 = components[j]
                
                # Distance
                dist = np.linalg.norm(c1["centroid"] - c2["centroid"])
                
                is_proximal = dist <= self.proximity_threshold
                is_adjacent = False
                
                # Optimization: Only check adjacency if bounding boxes are close
                # This prevents expensive binary dilation on entire 3D volume if they are far
                if is_proximal:
                    is_adjacent = self._compute_surface_distance_approx(c1["mask"], c2["mask"])
                
                if is_proximal or is_adjacent:
                    G.add_edge(
                        c1["node_id"], 
                        c2["node_id"], 
                        centroid_distance=float(dist),
                        is_adjacent=bool(is_adjacent)
                    )

        return G
