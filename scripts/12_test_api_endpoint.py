import requests
from pathlib import Path
import json

def test_predict():
    url = "http://localhost:8000/api/predict"
    
    # We need 4 dummy NIfTI files or real ones. Let's find one real subject.
    data_dir = Path("data/raw")
    subject_dirs = [d for d in data_dir.iterdir() if d.is_dir() and d.name.startswith("BraTS")]
    if not subject_dirs:
        print("No subjects found in data/raw")
        return
        
    subject_dir = subject_dirs[0]
    subject_id = subject_dir.name
    
    t1n_path = subject_dir / f"{subject_id}-t1n.nii.gz"
    t1c_path = subject_dir / f"{subject_id}-t1c.nii.gz"
    t2w_path = subject_dir / f"{subject_id}-t2w.nii.gz"
    t2f_path = subject_dir / f"{subject_id}-t2f.nii.gz"
    
    if not all(p.exists() for p in [t1n_path, t1c_path, t2w_path, t2f_path]):
        print(f"Missing files in {subject_dir}")
        return
        
    print(f"Testing /api/predict with subject {subject_id}")
    
    with open(t1n_path, "rb") as f_t1n, \
         open(t1c_path, "rb") as f_t1c, \
         open(t2w_path, "rb") as f_t2w, \
         open(t2f_path, "rb") as f_t2f:
             
        files = {
            "t1n": (t1n_path.name, f_t1n, "application/gzip"),
            "t1c": (t1c_path.name, f_t1c, "application/gzip"),
            "t2w": (t2w_path.name, f_t2w, "application/gzip"),
            "t2f": (t2f_path.name, f_t2f, "application/gzip"),
        }
        
        try:
            response = requests.post(url, files=files)
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                print("Response JSON:")
                print(json.dumps(response.json(), indent=2))
            else:
                print("Error Body:")
                print(response.text)
        except Exception as e:
            print(f"Request failed: {e}")

if __name__ == "__main__":
    test_predict()
