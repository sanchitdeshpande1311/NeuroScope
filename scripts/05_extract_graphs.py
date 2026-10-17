import json
import logging
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))
import networkx as nx
from tqdm import tqdm
from monai.data import Dataset, DataLoader
from ml.preprocessing import get_val_transforms
from ml.graph_builder import BraTSGraphBuilder

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extract_graphs(num_subjects=5, out_dir="data/processed/graphs_v2"):
    """
    Extracts graphs for a subset of subjects to validate the GraphBuilder.
    Uses the deterministic validation transforms (full volume, RAS, 1 mm, no random crop/flip).
    The earlier version used the random training transforms, so data/processed/graphs/ (v1) is not
    reproducible and has the T1/T1Gd means swapped; v2 is written to a separate folder.
    """
    metadata_dir = Path("metadata")
    manifest_path = metadata_dir / "validated_manifest.json"
    
    if not manifest_path.exists():
        logger.error(f"Manifest {manifest_path} not found.")
        return
        
    with open(manifest_path, "r") as f:
        valid_subjects = json.load(f)
        
    subset = valid_subjects[:num_subjects]
    
    transforms = get_val_transforms()
    # Apply transforms individually to avoid DataLoader batch collation for this simple test
    # Or just use DataLoader with batch_size=1
    dataset = Dataset(data=subset, transform=transforms)
    dataloader = DataLoader(dataset, batch_size=1, num_workers=0)
    
    builder = BraTSGraphBuilder(adjacency_threshold=2.0, proximity_threshold=30.0)
    
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Extracting graphs for {len(subset)} subjects...")
    
    for i, batch in enumerate(tqdm(dataloader)):
        subject_id = subset[i]["subject_id"]
        
        # Batch size is 1, so shape is [1, C, H, W, D]
        # We pass the single item [C, H, W, D] to build_graph
        image_tensor = batch["image"][0]
        label_tensor = batch["label"][0]
        
        G = builder.build_graph(image_tensor, label_tensor)
        
        out_file = out_dir / f"{subject_id}_graph.json"
        
        # networkx serialization requires converting numpy/tuple types
        data = nx.node_link_data(G)
        
        # Fix tuples/arrays for JSON serialization
        for node in data["nodes"]:
            if "centroid" in node and isinstance(node["centroid"], (tuple, list)):
                node["centroid"] = [float(c) for c in node["centroid"]]
                
        with open(out_file, "w") as out:
            json.dump(data, out, indent=4)
            
        logger.info(f"Subject {subject_id}: Found {G.number_of_nodes()} nodes, {G.number_of_edges()} edges.")
        
        if i == 0:
            logger.info("Sample Graph Summary (Subject 1):")
            for n, d in G.nodes(data=True):
                logger.info(f"  Node {n}: Class={d['class_type']}, Vol={d['volume']}, Centroid={tuple(round(c, 1) for c in d['centroid'])}")
            for u, v, d in G.edges(data=True):
                logger.info(f"  Edge {u}-{v}: Dist={d['centroid_distance']:.1f}, Adjacent={d['is_adjacent']}")

if __name__ == "__main__":
    extract_graphs(num_subjects=5)
