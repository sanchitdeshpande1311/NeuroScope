# NeuroScope 3D — Likely Judge Questions and Answers

*Short answer first, then "More" for follow-ups. "Evidence" points to the file that supports the answer. **[NEEDS CONFIRMATION]** marks things the repository cannot prove; the note says what to check.*

---

## 1. Basic project introduction

**Q1. What is NeuroScope 3D, in one line?**
A web app that takes four brain MRI scans, uses our trained 3D U-Net to predict the tumour regions, and lets you explore, measure, analyse and report them in 2D and 3D.

**Q2. What does a user actually get at the end?**
The tumour volumes (WT, TC, ET), a linked 2D/3D view, a graph path analysis, expert metrics (if an expert mask is given), a PDF report and the segmentation file `SEG.nii.gz`.
*Evidence:* `frontend/src/app/runs/[id]/page.tsx`, `ml/report_full.py`.

**Q3. Is it a finished product?**
It is a working research and teaching prototype that runs locally. It is not deployed publicly and is not clinically approved.

## 2. Problem statement and target users

**Q4. What problem are you solving?**
Brain tumour MRI is four 3D scans with hundreds of slices. It is hard to outline, measure and picture the tumour in 3D. We automate the outline and make it easy to explore and report.

**Q5. Who are your users?**
Researchers, students and teachers, biomedical engineers, and clinicians evaluating the tool in research settings.
*More:* No outside user has formally tested it yet; all testing was done by our team on public data.

**Q6. Why would a radiologist use this instead of their hospital software?**
We don't claim they should. It is a research and teaching tool that puts segmentation, 3D exploration, graph analysis, comparison and reporting in one browser workflow. It is not a replacement for clinical systems.

## 3. Technology stack

**Q7. What is your tech stack?**
- Backend: Python, FastAPI, PyTorch and MONAI for the AI, NiBabel for MRI files, SciPy for Dijkstra, scikit-image for 3D meshes, ReportLab for the PDF.
- Frontend: Next.js 16, React 19, TypeScript, and NiiVue for the WebGL viewer.
*Evidence:* `requirements.txt`, `frontend/package.json`.

**Q8. Why MONAI?**
It is the standard open-source (Apache-2.0) library for medical-imaging AI. It gives tested 3D networks, medical transforms (reorientation, resampling) and sliding-window inference for large 3D volumes.

**Q9. Why NiiVue for the viewer?**
It is built for neuroimaging. It reads NIfTI directly, shows linked multiplanar and 3D views on the GPU through WebGL, and supports overlays and meshes.

**Q10. Why FastAPI?**
Simple Python APIs that sit next to the PyTorch model, with built-in request validation and file uploads.

## 4. AI model and segmentation

**Q11. Which model do you use?**
A MONAI 3D UNet: 4 input channels, 3 output channels, features 16→256, 2 residual units, about 4.8 M parameters.
*Evidence:* `docs/MODEL_CARD.md`, `ml/inference.py`.

**Q12. Why a 3D U-Net?**
Tumours are 3D objects. A 3D U-Net looks at neighbouring slices together, which a 2D network can't. Its encoder–decoder with skip connections is the standard, proven design for voxel-level medical segmentation.

**Q13. What exactly does the model output?**
Three probability maps: tumour core, whole tumour and enhancing tumour. We threshold them at 0.5 and convert to labels 1 (necrotic/non-enhancing core), 2 (oedema) and 4 (enhancing).

**Q14. How long does it take?**
About 9–10 s for the whole request on an RTX 3050 laptop GPU, including validation, inference, meshes, graph and PDF. Inference itself is about 1.2–1.6 s.
*Evidence:* `docs/TEST_RESULTS.md`.

**Q15. Can it run without a GPU?**
Yes in principle: the code falls back to CPU (`ml/inference.py`, line 315). **[NEEDS CONFIRMATION]** We have not measured CPU time — run one case on CPU before claiming a number.

**Q16. Is the output aligned with the original scan?**
Yes. The probabilities are resampled back to the original T1Gd grid using both affines, and the file keeps the original affine. Tests check orientation flips and anisotropic voxels.
*Evidence:* `docs/TEST_RESULTS.md` Tests 3–5.

**Q17. What if one MRI sequence is missing?**
The upload is refused with a clear message ("Missing required sequence(s)… All four are required"). The model needs all four.
*Evidence:* `results/judging_tests.json` → `test_07_invalid_three_sequences`.

**Q18. What if the files are corrupted or on different grids?**
The server refuses them with a specific code — not gzip, corrupt gzip, shape mismatch, not 3D, all zero, non-finite values, file too large — and no result is produced.
*Evidence:* `docs/TEST_RESULTS.md` Test 7.

## 5. MRI sequences and tumour regions

**Q19. Why do you need four sequences?**
Each one shows different tissue. T1Gd shows enhancing tumour, FLAIR and T2 show oedema, and T1 shows anatomy. Together they let the model tell the regions apart.

**Q20. What are WT, TC and ET?**
- WT (whole tumour) = all tumour labels (1 + 2 + 4).
- TC (tumour core) = core without oedema (1 + 4).
- ET (enhancing tumour) = 4 only.
These are the standard BraTS evaluation regions.

**Q21. What is oedema?**
Swelling and fluid around the tumour (label 2). It is bright on FLAIR.

## 6. Dataset and training

**Q22. What data did you train on?**
BraTS 2023 Adult Glioma (GLI) training data, 1,251 scans of pre-operative adult gliomas, skull-stripped and co-registered at 1 mm.
*Evidence:* `docs/MODEL_CARD.md`, `docs/DATA_AND_LICENCES.md`.

**Q23. How did you train it?**
- Dice loss, Adam (learning rate 1e-4, cosine schedule), 50 epochs, batch size 1.
- 128³ random crops with flips and 90° rotations, mixed precision, on an RTX 3050.
*Evidence:* `scripts/09_train_baseline_gpu.py`, `scripts/09_resume_baseline_gpu.py`.

**Q24. What accuracy did you get, and where is it documented?**
On 30 patient-disjoint held-out cases: mean Dice WT 0.875, TC 0.833, ET 0.810; sensitivity 0.921 / 0.904 / 0.853.
*Evidence:* `results/heldout_eval.json`, `docs/MODEL_CARD.md`. These are development results, not hidden-test results.

**Q25. Was there any data leakage?**
The original split was per scan, so 21 patients appear in both train and test. We noticed and evaluated only on the 163 test patients absent from training (30 of them in the reported run). Separately, BraTS 2023 contains BraTS 2021 patients, so a BraTS 2021 test set may overlap our training data.
*Evidence:* `docs/MODEL_CARD.md`, `docs/ORGANISER_QUESTIONS.md`.

**Q26. Did you tune anything on the test or hidden cases?**
No. The threshold (0.5), the refinement size (10 mm³) and the sanity ranges were fixed in advance; no hidden case was used.
*Evidence:* `docs/DATA_AND_LICENCES.md`, "Hidden-case policy".

## 7. Three-dimensional visualisation

**Q27. How does the 3D view work?**
NiiVue renders the T1Gd volume plus tumour and brain surfaces on the GPU. The surfaces are made on the server with marching cubes (`ml/meshes.py`). You can rotate, zoom and toggle layers.

**Q28. What does "linked views" mean?**
Clicking any view moves one shared 3D point, so the axial, coronal, sagittal and 3D views all jump to the same spot. A readout shows mm and voxel coordinates. We tested it to within 1 voxel (Test 6).

**Q29. What is Show Definitions?**
An optional hover label (off by default). Point at a region and it says "Edema", "Enhancing Tumor", "WT", "Shortest Path" and so on. It uses the viewer's real coordinates and ray casting, not guesses.
*Evidence:* `frontend/src/lib/picking.ts`.

## 8. Mathematical model and Graph Analysis

**Q30. How does your mathematical model work?**
- We split the brain into small blocks (about 4 mm). Each block is a vertex labelled by its predicted tissue.
- Neighbouring blocks are joined by edges whose length is the real distance in mm.
- Dijkstra's algorithm finds the shortest path between two tumour components.
*Evidence:* `ml/spatial_graph.py`.

**Q31. What does the shortest path tell you?**
The shortest route through the brain between two predicted tumour parts, its length, and how much of it runs through tumour versus non-tumour tissue. It is a spatial-connectivity measurement. It is **not** a prediction of growth or spread.

**Q32. What are Mode A and Mode B?**
- Mode A: cost = physical distance.
- Mode B (experimental): steps through non-tumour tissue cost α times more, so the path prefers to stay inside the predicted tumour. α is the user's choice; it is not a biological parameter.

**Q33. What is the novelty of your graph analysis?**
It combines a physically measured whole-brain lattice (using the scan's affine), tissue classes from the AI prediction, and Dijkstra paths between tumour components, with a tissue breakdown, inside an interactive 3D viewer and the report. **[NEEDS CONFIRMATION]** We haven't done a literature search, so don't claim "first in the world".

## 9. Dijkstra's algorithm and graph weights

**Q34. Why Dijkstra and not BFS or A\*?**
Our edges have different lengths (face, edge or corner neighbours, non-square voxels), so we need a weighted shortest path with non-negative weights, and that is exactly what Dijkstra solves. BFS ignores weights. A\* would need a heuristic and gives the same answer here.

**Q35. How big is the graph?**
On the demo case (4 mm): 23,506 vertices and 284,916 edges in the brain lattice. On the default graph page, 2,127 vertices and 12,395 edges are drawn.
*Evidence:* the report for case c9e61b4e; `GRAPH_ANALYSIS_IMPLEMENTATION_REPORT.txt`.

**Q36. How do you know the path is correct?**
Unit tests check that the path length equals the sum of its edges, the triangle inequality, symmetry, a zero-length path to itself, and refusal of invalid inputs (11 test functions in `tests/test_spatial_graph.py`). We use SciPy's tested `dijkstra`.

## 10. Mathematical refinement

**Q37. What is the refinement?**
It removes isolated predicted fragments smaller than 10 mm³ and saves a separate refined mask. The original prediction is never changed.

**Q38. Does refinement improve accuracy?**
Not meaningfully. On 30 held-out cases the mean Dice change was +0.0008 for WT and 0 for TC and ET. That is why it is hidden from the main menu and the unrefined prediction is primary.
*Evidence:* `results/refinement_eval_summary.json`.

## 11. Expert Comparison and evaluation metrics

**Q39. How do you compare with an expert?**
The user uploads the expert's mask with the scans. We compute Dice, sensitivity, precision, false-positive and false-negative voxels, and volume differences for WT, TC and ET.
*Evidence:* `ml/inference.py` → `compare_to_reference()`.

**Q40. What is the Dice score?**
The overlap between two outlines: 2 × shared voxels ÷ total voxels of both. 1 = identical, 0 = no overlap.

**Q41. Do you compute IoU?**
No. Dice and IoU carry the same information (IoU = Dice ÷ (2 − Dice)), so it could be added easily.

**Q42. What if there is no expert mask?**
The Expert page says no reference was provided and shows no metrics. We never estimate them.

## 12. Locate, AI assistant and Tumor Tracker

**Q43. What does Locate do?**
It finds neurologists, neurosurgeons and hospitals near a city or your location, using live OpenStreetMap data (no paid API). The Locate button sits in the header.

**Q44. How does the chatbot work?**
- It is a separate app shown in a floating panel. Your question goes to its server, which calls a Gemini model through the Lovable AI gateway.
- Without our own `LOVABLE_API_KEY`, it forwards to the module's own cloud deployment.
- It answers questions about MRI, WT/TC/ET, metrics and the project, and keeps the conversation.
*Evidence:* `modules/screenshot-perfect-project-39/src/routes/api/chat.ts`.

**Q45. Can the chatbot read my scans?**
No. We send no scan or case data to it. It only explains concepts.

**Q46. What does Tumor Tracker compare?**
Two studies of the same patient taken at different times. It segments both (MONAI SegResNet), aligns them with rigid registration (SimpleITK), and reports volume change per region, a change map and a PDF.
- Tested through its API on BraTS-GLI-00008 (000 → 001): complete in 12 s.

**Q47. How are the four modules connected?**
- Each runs as its own service.
- Our Next.js app serves the landing page at `/` and shows Locate, the assistant and Tracker in frames.
- Start Segmentation, the Locate button, the brain button and the 6th menu item are the entry points.
*Evidence:* `INTEGRATION_REPORT.md`, `frontend/next.config.ts`.

**Q48. Does Tracker use your model?**
No. It has its own model (MONAI's SegResNet bundle, Apache-2.0). It is a separate tool, and no data flows automatically between it and NeuroScope.

## 13. System architecture and deployment

**Q49. Where is the model hosted?**
Locally, in our FastAPI backend on the laptop's GPU. It is loaded once at startup from `models/baseline_checkpoints/best_metric_model.pth`. There is no cloud hosting.

**Q50. Is it deployed?**
No. It runs locally at http://localhost:3000. Deploying needs a GPU server for the backend and hosting for the module services.

**Q51. What runs in the browser and what runs on the server?**
- Server: all AI, graph, metrics and PDF work.
- Browser: rendering (WebGL), hover picking and navigation.

## 14. Novelty and differentiation

**Q52. What is actually new here?**
The combination in one browser workflow:
- segmentation written on the original grid;
- linked 2D/3D exploration with hover labels;
- a physically measured lattice graph with Dijkstra paths between tumour components;
- expert metrics and an automatic report;
- plus Locate, the assistant and Tracker.

**Q53. Isn't this just BraTS + U-Net, which many people have done?**
The model is a standard, well-understood choice, deliberately. Our contribution is the careful pipeline (preprocessing parity, original-grid output, validation), the interactive analysis (graph and Dijkstra, Show Definitions), comparison, reporting, and honest documentation.

## 15. Accuracy, limitations and clinical safety

**Q54. Can this be used for clinical diagnosis?**
No. It is a research and teaching prototype, not a medical device, with no clinical validation. Every page and report says so.

**Q55. What are the main limitations?**
- Development results only.
- The model over-predicts enhancing tumour when there is little enhancement.
- Only adult pre-operative glioma inputs (skull-stripped, co-registered).
- Possible BraTS 2021/2023 overlap.
- Timing only on an RTX 3050.
- Not deployed.

**Q56. Where does your model fail?**
On a blind case it predicted 6.0 mL of enhancing tumour where the expert had none (ET Dice 0), with high confidence. Raising the threshold would not fix it. It is a genuine model limitation, and we documented it.
*Evidence:* `docs/TEST_RESULTS.md`, blind-case investigation.

## 16. Privacy, security and data handling

**Q57. What happens to uploaded scans?**
They are processed on our own server. T1 and T2 are deleted after processing; the rest is deleted automatically after 23 hours, or immediately with Delete. Each case has a random ID.
*Evidence:* `backend/main.py`.

**Q58. Does any external service receive data?**
- The assistant receives typed chat text (sent to an external AI service).
- Locate sends the searched place or coordinates to OpenStreetMap.
- No MRI data goes to any external service.

**Q59. How do you handle secrets?**
Keys live only in server environment variables; `.env` files are not committed or packaged. Our workspace needs no key. The assistant can use `LOVABLE_API_KEY` on its server.

## 17. Performance, scalability and reliability

**Q60. Is the output reproducible?**
Yes. Two runs give bit-identical masks (Dice 1.0), with deterministic cuDNN and fp32.
*Evidence:* Test 8.

**Q61. Can it handle many users?**
Not tested. It is a single-machine prototype with one model in memory. Scaling would need a job queue and GPU workers. **[NEEDS CONFIRMATION]** if asked for numbers — none were measured.

**Q62. How do you know it works?**
- 51 automated backend tests pass.
- Type check, lint and build pass.
- Module tests pass: Locate 53, Tracker backend 14, and the others.
- Browser end-to-end runs: landing → upload → results → graph → report, plus Locate, the assistant and Tracker.
*Evidence:* `INTEGRATION_REPORT.md` §6, `docs/TEST_RESULTS.md`.

## 18. Future scope

**Q63. What would you improve with more time?**
- External validation and a comparison with the organiser's baseline.
- Better ET handling and uncertainty maps.
- CPU and T4 benchmarks.
- A secure cloud deployment with authentication.
- Clinician user studies.
- Optional, consented data flow from NeuroScope into Tracker.

## 19. Difficult or challenging questions

**Q64. Your Dice of 0.875 — is that good?**
It is in a reasonable range for a compact 3D U-Net on BraTS development data. We have not compared it with the organiser's baseline or with leaderboard models, so we don't claim it beats them.

**Q65. Your graph path doesn't model biology, so why is it useful?**
It quantifies spatial relationships — how far apart tumour parts are and how much tissue lies between them — in real millimetres, from the model's output. It is a descriptive measurement for researchers and teaching, and we say clearly that it does not predict growth.

**Q66. If you trained on BraTS 2023 and the judges test on BraTS 2021, isn't that cheating?**
We raised this ourselves (`docs/ORGANISER_QUESTIONS.md`): BraTS 2023 includes the BraTS 2021 patients. We did not use any hidden cases and we disclosed the overlap; the organisers must rule on eligibility.

**Q67. Who owns or licenses the model weights?**
Our team trained them. **[NEEDS CONFIRMATION]** No licence has been chosen yet (`docs/MODEL_CARD.md`) — decide one (for example Apache-2.0 or CC BY-NC) before the pitch.

**Q68. Did any doctor validate your results?**
No. Expert comparison uses the BraTS expert masks. **[NEEDS CONFIRMATION]** if a clinician has reviewed the app informally — only mention it if that really happened.

**Q69. The chatbot sends data to a third-party cloud — is that safe?**
It sends only what you type, not scans or case data. For real use we would set our own key or a self-hosted model, and add a privacy notice.

**Q70. Why are there so many separate services?**
Each module was built separately with its own framework. Running them as services kept their code unchanged and isolated, which was safer in hackathon time. A production version would consolidate them.
