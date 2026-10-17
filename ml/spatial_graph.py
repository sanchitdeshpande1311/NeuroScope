"""
Brain-wide spatial lattice graph G = (V, E, W) built from the CURRENT predicted segmentation and the
MRI brain mask, with Dijkstra shortest paths between selected locations.

Construction (documented, deterministic):
  * Brain domain: non-zero voxels of the run's T1Gd OR FLAIR (inputs are skull-stripped), holes filled.
    Only the model prediction (seg.nii.gz) is used for tissue classes; an expert mask is never read here.
  * Vertices: the volume is tiled into blocks of s_x x s_y x s_z voxels, with s_a = max(1, round(target_mm /
    spacing_a)), so the lattice spacing is ~target_mm along every axis even for anisotropic voxels.
    A block becomes a vertex if >= 50 % of its voxels are brain or it contains any predicted-tumour voxel.
    Vertex position = geometric block centre (voxel coordinates, may be fractional) mapped through the
    NIfTI affine to world millimetres. Vertex class = majority label of the block's brain voxels among
    {0 non-tumour brain, 1 NCR/NET, 2 edema, 4 enhancing}; per-label fractions are kept.
  * Tumour components: 26-connected components of predicted WT at voxel level (volume, centroid). Each
    lattice vertex records the component holding most of its voxels; a component's representative vertex
    is its vertex nearest the component centroid (used when a component is chosen as source/destination).
  * Edges: 26-neighbour adjacency between existing lattice vertices (blocks that touch by face, edge or
    corner). No other edges are created; gaps (outside the brain) stay gaps.
  * Edge length = || A[:3,:3] @ (delta_block * s) || in mm, i.e. the physical distance between vertex
    centres through the affine (axial vs diagonal steps differ correctly; anisotropy handled).
  * Edge cost, mode "A" (physical): cost = length.
    Mode "B" (experimental, hypothetical): cost = length * (w_u + w_v) / 2 with w = 1 for predicted-tumour
    vertices and w = alpha (>= 1, user-chosen) for non-tumour vertices. This only expresses a user-chosen
    preference for staying inside the predicted tumour; it is NOT a biological resistance model.
  * Shortest paths: scipy.sparse.csgraph.dijkstra (non-negative costs), predecessors reconstructed into the
    exact vertex sequence that is returned and rendered.
Dijkstra describes spatial connectivity of this graph. It does not predict tumour growth or spread.
"""
from __future__ import annotations

import hashlib
import itertools
import time

import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra

CLASS_NAMES = {0: "non_tumour_brain", 1: "ncr_net", 2: "edema", 4: "enhancing"}
LABELS = (0, 1, 2, 4)
_HALF = [o for o in itertools.product((-1, 0, 1), repeat=3) if o > (0, 0, 0)]  # 13 offsets, each edge once


class GraphBuildError(ValueError):
    pass


def sha256_array(a: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(a).tobytes() + str(a.shape).encode() + str(a.dtype).encode()).hexdigest()


class SpatialGraph:
    def __init__(self, seg: np.ndarray, brain: np.ndarray, affine: np.ndarray, zooms, target_mm: float = 4.0):
        t0 = time.perf_counter()
        seg = np.asarray(seg)
        brain = np.asarray(brain).astype(bool)
        affine = np.asarray(affine, dtype=float)
        if seg.ndim != 3 or brain.shape != seg.shape:
            raise GraphBuildError(f"segmentation {seg.shape} and brain mask {brain.shape} must be the same 3D grid")
        if affine.shape != (4, 4) or not np.all(np.isfinite(affine)) or abs(np.linalg.det(affine[:3, :3])) < 1e-9:
            raise GraphBuildError("invalid affine")
        if not np.isfinite(target_mm) or not (1.0 <= target_mm <= 16.0):
            raise GraphBuildError("target spacing must be between 1 and 16 mm")
        if not set(np.unique(seg).tolist()) <= set(LABELS):
            raise GraphBuildError("segmentation must contain only labels 0/1/2/4")
        tumour = seg > 0
        brain = brain | tumour
        if brain.sum() == 0:
            raise GraphBuildError("empty brain mask")
        self.affine, self.zooms = affine, tuple(float(z) for z in zooms)
        self.target_mm = float(target_mm)
        self.step = np.array([max(1, int(round(target_mm / z))) for z in self.zooms])
        self.seg_sha256 = sha256_array(seg)
        sx, sy, sz = self.step
        nb = [int(np.ceil(seg.shape[a] / self.step[a])) for a in range(3)]
        pad = [(0, nb[a] * self.step[a] - seg.shape[a]) for a in range(3)]
        segp, brainp = np.pad(seg, pad), np.pad(brain, pad)
        # per-block label counts (brain voxels only)
        blk = lambda m: m.reshape(nb[0], sx, nb[1], sy, nb[2], sz).sum(axis=(1, 3, 5))  # noqa: E731
        block_vox = int(sx * sy * sz)
        brain_cnt = blk(brainp.astype(np.int32))
        counts = np.stack([blk(((segp == lab) & brainp).astype(np.int32)) for lab in LABELS], axis=-1)
        tum_cnt = counts[..., 1:].sum(-1)
        keep = (brain_cnt >= 0.5 * block_vox) | (tum_cnt > 0)
        bidx = np.argwhere(keep)                                   # block indices of vertices
        self.n = len(bidx)
        self.block_index = -np.ones(nb, dtype=np.int64)
        self.block_index[tuple(bidx.T)] = np.arange(self.n)
        self.bidx = bidx
        self.vox = bidx * self.step + (self.step - 1) / 2.0        # block centre in voxel coordinates
        self.mm = self.vox @ affine[:3, :3].T + affine[:3, 3]      # world mm (affine applied exactly once)
        c = counts[tuple(bidx.T)]                                  # (n, 4)
        self.cls = np.array(LABELS)[np.argmax(c, axis=1)]
        self.tumour_fraction = c[:, 1:].sum(1) / np.maximum(brain_cnt[tuple(bidx.T)], 1)
        # WT components (voxel level, 26-conn) and the vertex that holds most of each component
        lab, ncomp = ndimage.label(tumour, structure=np.ones((3, 3, 3)))
        labp = np.pad(lab, pad)
        self.vertex_component = np.zeros(self.n, dtype=np.int64)
        self.components = []
        vox_ml = float(np.prod(self.zooms)) / 1000.0
        if ncomp:
            # component voxel counts per block
            blocks_of_vox = np.argwhere(labp > 0)
            comp_of_vox = labp[labp > 0]
            bid = self.block_index[tuple((blocks_of_vox // self.step).T)]
            pair = np.stack([bid, comp_of_vox], 1)
            uniq, cnt = np.unique(pair, axis=0, return_counts=True)
            best_comp_for_vertex = {}
            for (v, k), n_ in zip(uniq.tolist(), cnt.tolist()):
                if v >= 0 and n_ > best_comp_for_vertex.get(v, (0, 0))[1]:
                    best_comp_for_vertex[v] = (k, n_)
            for v, (k, _) in best_comp_for_vertex.items():
                self.vertex_component[v] = k
            sizes = ndimage.sum_labels(tumour, lab, np.arange(1, ncomp + 1))
            cents = ndimage.center_of_mass(tumour, lab, np.arange(1, ncomp + 1))
            for k in range(1, ncomp + 1):
                cvox = np.array(cents[k - 1])
                cmm = affine[:3, :3] @ cvox + affine[:3, 3]
                # representative vertex = the component's vertex nearest its centroid (stable across lattice
                # spacings); fallback for components too small to own a vertex: blocks containing its voxels
                cand = np.nonzero(self.vertex_component == k)[0]
                if len(cand) == 0:
                    cand = uniq[uniq[:, 1] == k, 0]
                    cand = cand[cand >= 0]
                rep = int(cand[np.argmin(np.linalg.norm(self.mm[cand] - cmm, axis=1))])
                comp_labels = seg[lab == k]
                self.components.append({
                    "id": k, "voxels": int(sizes[k - 1]), "volume_ml": float(sizes[k - 1] * vox_ml),
                    "centroid_vox": cvox.round(2).tolist(),
                    "centroid_mm": cmm.round(2).tolist(),
                    "labels_ml": {CLASS_NAMES[l]: float((comp_labels == l).sum() * vox_ml) for l in (1, 2, 4)},
                    "representative_vertex": rep,
                    "n_vertices": int((self.vertex_component == k).sum()),
                })
            self.components.sort(key=lambda d: -d["voxels"])
        # edges: 26-neighbour lattice adjacency, physical length via the affine
        src, dst, length = [], [], []
        for o in _HALF:
            o = np.array(o)
            nbk = bidx + o
            ok = np.all((nbk >= 0) & (nbk < nb), axis=1)
            tgt = np.full(self.n, -1, dtype=np.int64)
            tgt[ok] = self.block_index[tuple(nbk[ok].T)]
            good = tgt >= 0
            src.append(np.nonzero(good)[0]); dst.append(tgt[good])
            length.append(np.full(good.sum(), float(np.linalg.norm(affine[:3, :3] @ (o * self.step)))))
        self.src = np.concatenate(src); self.dst = np.concatenate(dst); self.length = np.concatenate(length)
        self.degree = np.bincount(np.concatenate([self.src, self.dst]), minlength=self.n)
        self._csr = {}
        g = coo_matrix((np.ones(len(self.src)), (self.src, self.dst)), shape=(self.n, self.n))
        self.n_cc, self.cc_label = connected_components(g, directed=False)
        self.build_s = time.perf_counter() - t0

    # ------------------------------------------------------------------ costs
    def edge_cost(self, mode: str = "A", alpha: float = 1.0) -> np.ndarray:
        if mode == "A":
            return self.length.copy()
        if mode == "B":
            if not np.isfinite(alpha) or alpha < 1.0 or alpha > 100.0:
                raise GraphBuildError("alpha must be between 1 and 100")
            w = np.where(self.cls > 0, 1.0, float(alpha))
            return self.length * (w[self.src] + w[self.dst]) / 2.0
        raise GraphBuildError("mode must be 'A' or 'B'")

    def csr(self, mode="A", alpha=1.0):
        key = (mode, round(float(alpha), 4))
        if key not in self._csr:
            cost = self.edge_cost(mode, alpha)
            self._csr[key] = coo_matrix((cost, (self.src, self.dst)), shape=(self.n, self.n)).tocsr()
            if len(self._csr) > 6:
                self._csr.pop(next(iter(self._csr)))
        return self._csr[key]

    # ------------------------------------------------------------------ checks + stats
    def validate(self) -> dict:
        pairs = np.sort(np.stack([self.src, self.dst], 1), axis=1)
        checks = {
            "vertex_references_valid": bool(len(self.src) == 0 or (self.src.min() >= 0 and max(self.src.max(), self.dst.max()) < self.n)),
            "no_self_loops": bool(np.all(self.src != self.dst)),
            "no_duplicate_edges": bool(len(np.unique(pairs, axis=0)) == len(pairs)),
            "edge_lengths_finite_positive": bool(np.all(np.isfinite(self.length)) and np.all(self.length > 0)),
            "costs_finite_non_negative_mode_A": bool(np.all(np.isfinite(self.edge_cost("A"))) and np.all(self.edge_cost("A") >= 0)),
            "vertex_coordinates_finite": bool(np.all(np.isfinite(self.mm))),
        }
        checks["all_passed"] = all(checks.values())
        return checks

    def stats(self) -> dict:
        iso = int((self.degree == 0).sum())
        cc_sizes = np.bincount(self.cc_label)
        return {
            "vertices": int(self.n), "edges": int(len(self.src)),
            "connected_components": int(self.n_cc), "largest_component_vertices": int(cc_sizes.max()) if len(cc_sizes) else 0,
            "isolated_vertices": iso,
            "degree": {"min": int(self.degree.min()), "max": int(self.degree.max()), "mean": float(self.degree.mean())},
            "vertices_by_class": {CLASS_NAMES[l]: int((self.cls == l).sum()) for l in LABELS},
            "build_s": self.build_s,
            "method": "block lattice over the MRI brain mask; vertex = block centre; class = majority predicted label; "
                      "edges = 26-neighbour block adjacency; length = |A[:3,:3]·Δ| mm",
            "block_voxels": self.step.tolist(),
            "lattice_spacing_mm": [float(np.linalg.norm(self.affine[:3, a] * self.step[a])) for a in range(3)],
            "edge_lengths_mm": sorted({round(float(x), 3) for x in np.unique(self.length.round(6))}),
        }

    # ------------------------------------------------------------------ selection + Dijkstra
    def nearest_vertex(self, mm) -> tuple[int, float]:
        d = np.linalg.norm(self.mm - np.asarray(mm, float)[:3], axis=1)
        v = int(np.argmin(d))
        return v, float(d[v])

    def resolve(self, spec: str) -> dict:
        """'v<id>' vertex, 'c<id>' tumour component representative vertex, 'mm:x,y,z' nearest vertex."""
        spec = (spec or "").strip()
        if spec.startswith("v") and spec[1:].isdigit():
            v = int(spec[1:])
            if not 0 <= v < self.n:
                raise GraphBuildError("vertex id out of range")
            return {"vertex": v, "how": "vertex id", "snap_mm": 0.0}
        if spec.startswith("c") and spec[1:].isdigit():
            k = int(spec[1:])
            comp = next((c for c in self.components if c["id"] == k), None)
            if comp is None:
                raise GraphBuildError("unknown tumour component")
            return {"vertex": comp["representative_vertex"], "how": f"representative vertex of tumour component {k}", "snap_mm": 0.0}
        if spec.startswith("mm:"):
            try:
                xyz = [float(x) for x in spec[3:].split(",")]
            except ValueError:
                raise GraphBuildError("bad mm coordinate")
            if len(xyz) != 3 or not np.all(np.isfinite(xyz)):
                raise GraphBuildError("bad mm coordinate")
            v, d = self.nearest_vertex(xyz)
            return {"vertex": v, "how": f"nearest graph vertex to ({', '.join(f'{x:.1f}' for x in xyz)}) mm", "snap_mm": d}
        raise GraphBuildError("source/destination must be v<id>, c<id> or mm:x,y,z")

    def vertex_info(self, v: int) -> dict:
        return {"id": int(v), "vox": self.vox[v].round(2).tolist(), "mm": self.mm[v].round(2).tolist(),
                "class": CLASS_NAMES[int(self.cls[v])], "component": int(self.vertex_component[v]),
                "graph_component": int(self.cc_label[v]), "degree": int(self.degree[v])}

    def shortest_path(self, s: int, t: int, mode="A", alpha=1.0) -> dict:
        t0 = time.perf_counter()
        g = self.csr(mode, alpha)
        dist, pred = dijkstra(g, directed=False, indices=int(s), return_predecessors=True)
        res = {"source": self.vertex_info(s), "destination": self.vertex_info(t), "mode": mode,
               "alpha": float(alpha) if mode == "B" else None, "euclidean_mm": float(np.linalg.norm(self.mm[t] - self.mm[s]))}
        if not np.isfinite(dist[t]):
            res.update({"reachable": False, "compute_s": time.perf_counter() - t0,
                        "reason": "The source and destination lie in different connected components of the graph; "
                                  "no sequence of adjacent vertices joins them, so no path exists."})
            return res
        seq = [int(t)]
        while seq[-1] != s:
            seq.append(int(pred[seq[-1]]))
        seq = seq[::-1]
        a, b = np.array(seq[:-1], dtype=np.int64), np.array(seq[1:], dtype=np.int64)
        step_len = np.linalg.norm(self.mm[b] - self.mm[a], axis=1)
        w = np.where(self.cls > 0, 1.0, float(alpha)) if mode == "B" else np.ones(self.n)
        step_cost = step_len * (w[a] + w[b]) / 2.0
        by_class = {name: 0.0 for name in CLASS_NAMES.values()}
        for u, v, L in zip(a, b, step_len):
            cu, cv = CLASS_NAMES[int(self.cls[u])], CLASS_NAMES[int(self.cls[v])]
            if cu == cv:
                by_class[cu] += float(L)
            else:  # an edge between two classes is split half/half between them
                by_class[cu] += float(L) / 2
                by_class[cv] += float(L) / 2
        res.update({
            "reachable": True, "vertices": seq, "n_vertices": len(seq), "n_edges": len(seq) - 1,
            "points_mm": self.mm[seq].round(3).tolist(), "points_vox": self.vox[seq].round(2).tolist(),
            "vertex_class": [CLASS_NAMES[int(self.cls[v])] for v in seq],
            "total_cost": float(dist[t]), "cost_from_steps": float(step_cost.sum()),
            "length_mm": float(step_len.sum()), "length_by_class_mm": by_class,
            "non_tumour_length_mm": by_class["non_tumour_brain"],
            "compute_s": time.perf_counter() - t0,
        })
        return res

    # ------------------------------------------------------------------ render data (subset of real edges)
    def render_subgraph(self) -> dict:
        tum = self.cls > 0
        shell = np.zeros(self.n, bool)
        is_t = tum[self.src] | tum[self.dst]
        shell[self.src[is_t]] = True
        shell[self.dst[is_t]] = True
        shown = tum | shell
        e = np.nonzero(is_t)[0]
        return {
            "rule": "all vertices whose class is a predicted tumour label, their 26-neighbours (the non-tumour shell), "
                    "and every real graph edge with at least one tumour endpoint. Shell-to-shell and whole-brain edges are "
                    "part of the graph but not drawn by default (see 'whole-brain lattice').",
            "vertex_ids": np.nonzero(shown)[0].tolist(),
            "edges": np.stack([self.src[e], self.dst[e]], 1).tolist(),
        }

    def lattice_arrays(self) -> dict:
        return {"mm": self.mm.round(2).tolist(), "cls": self.cls.tolist(), "src": self.src.tolist(), "dst": self.dst.tolist()}
