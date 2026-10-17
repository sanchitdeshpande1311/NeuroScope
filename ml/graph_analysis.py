"""
Graph-based descriptive analysis of a predicted (or expert) BraTS label map.

1. Region component graph: nodes = 26-connected components of WT / TC / ET with
   physical volume (mL) and world-space centroid (mm); edges = containment
   (ET comp inside TC comp inside WT comp).
2. Dijkstra geodesic extent: the voxels of WT form a graph (26-neighbourhood,
   edge weight = physical distance between voxel centres in mm, so anisotropic
   spacing is respected). Multi-source Dijkstra from all TC voxels gives, for every
   WT voxel, the shortest path length *through predicted tumour tissue* to the core.
   We report the max / 95th percentile, i.e. how far the predicted peritumoral
   region extends from the predicted core along tissue paths.

This is a DESCRIPTIVE measurement of the segmentation. It does not change the
segmentation and is not claimed to improve accuracy.
"""
from __future__ import annotations

import itertools
import time

import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

from .inference import labels_to_regions

_OFFSETS = [o for o in itertools.product((-1, 0, 1), repeat=3) if o > (0, 0, 0)]  # 13 half-neighbourhood


def component_graph(seg: np.ndarray, affine: np.ndarray, zooms) -> dict:
    vox_ml = float(np.prod(zooms)) / 1000.0
    regions = dict(zip(("WT", "TC", "ET"), labels_to_regions(seg)))
    nodes, labelled = [], {}
    for name, mask in regions.items():
        lab, n = ndimage.label(mask, structure=np.ones((3, 3, 3)))
        labelled[name] = lab
        if n == 0:
            continue
        idx = np.arange(1, n + 1)
        sizes = ndimage.sum_labels(mask, lab, idx)
        cents = ndimage.center_of_mass(mask, lab, idx)
        for i, (s, c) in enumerate(zip(sizes, cents)):
            world = (affine @ np.array([*c, 1.0]))[:3]
            nodes.append({"id": f"{name}{i + 1}", "region": name, "volume_ml": float(s * vox_ml),
                          "centroid_mm": [round(float(v), 2) for v in world]})
    edges = []
    for child, parent in (("ET", "TC"), ("TC", "WT")):
        lc, lp = labelled[child], labelled[parent]
        pairs = set(zip(lc[lc > 0].tolist(), lp[lc > 0].tolist()))
        edges += [{"from": f"{child}{a}", "to": f"{parent}{b}", "type": "contained_in"} for a, b in sorted(pairs) if b > 0]
    return {"nodes": nodes, "edges": edges,
            "n_components": {k: int(labelled[k].max()) for k in labelled}}


def geodesic_extent(seg: np.ndarray, zooms, max_voxels: int = 600_000) -> dict:
    """Multi-source Dijkstra from TC voxels over the WT voxel graph (physical edge weights)."""
    t0 = time.perf_counter()
    wt, tc, _ = labels_to_regions(seg)
    n = int(wt.sum())
    if n == 0 or not tc.any():
        return {"applied": False, "reason": "empty WT or TC"}
    if n > max_voxels:
        return {"applied": False, "reason": f"WT has {n} voxels (> {max_voxels}); skipped for runtime"}
    index = -np.ones(wt.shape, dtype=np.int64)
    coords = np.argwhere(wt)
    index[tuple(coords.T)] = np.arange(n)
    z = np.asarray(zooms, dtype=float)
    rows, cols, w = [], [], []
    S = wt.shape
    for o in _OFFSETS:
        o = np.array(o)
        nb = coords + o
        ok = np.all((nb >= 0) & (nb < S), axis=1)
        src, nb = np.nonzero(ok)[0], nb[ok]
        tgt = index[tuple(nb.T)]
        good = tgt >= 0
        rows.append(src[good]); cols.append(tgt[good])
        w.append(np.full(good.sum(), float(np.sqrt(((o * z) ** 2).sum()))))
    rows, cols, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
    g = coo_matrix((w, (rows, cols)), shape=(n, n)).tocsr()
    sources = index[tc & wt]
    dist = dijkstra(g, directed=False, indices=sources, min_only=True)
    finite = dist[np.isfinite(dist)]
    unreachable = int((~np.isfinite(dist)).sum())
    return {"applied": True, "algorithm": "scipy.sparse.csgraph.dijkstra (multi-source, min_only)",
            "graph_nodes": n, "graph_edges": int(g.nnz),
            "max_mm": float(finite.max()), "p95_mm": float(np.percentile(finite, 95)),
            "mean_mm": float(finite.mean()),
            "wt_voxels_unreachable_from_tc": unreachable,
            "runtime_s": time.perf_counter() - t0}


class GeodesicPathEngine:
    """
    Shortest paths through the predicted WT voxels (26-neighbourhood, edge weight = physical distance
    between voxel centres in mm). Multi-source Dijkstra from all TC voxels (scipy csgraph, min_only=True,
    return_predecessors=True) gives, for every WT voxel, the distance to the nearest TC voxel along
    predicted-tumour voxels and the predecessor chain that realises it. `path_to()` follows that chain,
    so a displayed path is exactly the path Dijkstra computed. Descriptive only - not a growth model.
    """

    def __init__(self, seg: np.ndarray, affine: np.ndarray, zooms, max_voxels: int = 600_000):
        t0 = time.perf_counter()
        wt, tc, _ = labels_to_regions(seg)
        self.affine = np.asarray(affine, float)
        self.n = int(wt.sum())
        self.ok = self.n > 0 and bool(tc.any()) and self.n <= max_voxels
        if not self.ok:
            self.reason = "empty WT or TC" if self.n == 0 or not tc.any() else f"WT has {self.n} voxels (> {max_voxels})"
            return
        self.index = -np.ones(wt.shape, dtype=np.int64)
        self.coords = np.argwhere(wt)
        self.index[tuple(self.coords.T)] = np.arange(self.n)
        z = np.asarray(zooms, dtype=float)
        rows, cols, w = [], [], []
        for o in _OFFSETS:
            o = np.array(o)
            nb = self.coords + o
            okm = np.all((nb >= 0) & (nb < wt.shape), axis=1)
            src, nb = np.nonzero(okm)[0], nb[okm]
            tgt = self.index[tuple(nb.T)]
            g = tgt >= 0
            rows.append(src[g]); cols.append(tgt[g])
            w.append(np.full(g.sum(), float(np.sqrt(((o * z) ** 2).sum()))))
        self.graph = coo_matrix((np.concatenate(w), (np.concatenate(rows), np.concatenate(cols))), shape=(self.n, self.n)).tocsr()
        self.graph = self.graph.maximum(self.graph.T)  # undirected
        sources = self.index[tc & wt]
        self.dist, self.pred, self.src = dijkstra(self.graph, directed=False, indices=sources, min_only=True,
                                                  return_predecessors=True)
        self.n_sources = int(len(sources))
        self.build_s = time.perf_counter() - t0

    def world(self, node):
        c = self.coords[node]
        return (self.affine @ np.array([*c, 1.0]))[:3]

    def nearest_node(self, mm):
        world = self.coords @ self.affine[:3, :3].T + self.affine[:3, 3]  # physical distance, any affine
        return int(np.argmin(np.linalg.norm(world - np.asarray(mm[:3], float), axis=1)))

    def path_to(self, node: int) -> dict:
        if not np.isfinite(self.dist[node]):
            return {"reachable": False, "target_node": node, "target_mm": self.world(node).round(2).tolist(),
                    "reason": "this WT voxel is not connected to any TC voxel through predicted tumour voxels"}
        chain = [node]
        while self.pred[chain[-1]] >= 0:
            chain.append(int(self.pred[chain[-1]]))
        chain = chain[::-1]  # source (TC) -> target
        pts = np.array([self.world(i) for i in chain])
        seg_len = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()) if len(pts) > 1 else 0.0
        return {"reachable": True, "target_node": node, "source_node": int(chain[0]),
                "length_mm": float(self.dist[node]), "length_from_points_mm": seg_len, "n_voxels": len(chain),
                "euclidean_mm": float(np.linalg.norm(pts[-1] - pts[0])),
                "points_mm": pts.round(2).tolist(),
                "source_vox": self.coords[chain[0]].tolist(), "target_vox": self.coords[node].tolist()}

    def summary(self) -> dict:
        if not self.ok:
            return {"applied": False, "reason": self.reason}
        f = self.dist[np.isfinite(self.dist)]
        return {"applied": True, "algorithm": "scipy.sparse.csgraph.dijkstra (multi-source from TC, min_only, predecessors)",
                "graph_nodes": self.n, "graph_edges_undirected": int(self.graph.nnz // 2), "sources_tc_voxels": self.n_sources,
                "max_mm": float(f.max()), "p95_mm": float(np.percentile(f, 95)), "mean_mm": float(f.mean()),
                "unreachable_wt_voxels": int((~np.isfinite(self.dist)).sum()), "build_s": self.build_s}

    def destinations(self, seg: np.ndarray, max_per_component: int = 1) -> list:
        """Candidate targets: the farthest reachable WT voxel overall and in each WT component (actual Dijkstra maxima)."""
        wt = labels_to_regions(seg)[0]
        lab, n = ndimage.label(wt, structure=np.ones((3, 3, 3)))
        comp_of = lab[tuple(self.coords.T)]
        out = []
        for c in range(1, n + 1):
            nodes = np.nonzero((comp_of == c) & np.isfinite(self.dist))[0]
            if len(nodes) == 0:
                continue
            best = int(nodes[np.argmax(self.dist[nodes])])
            out.append({"node": best, "component": int(c), "geodesic_mm": float(self.dist[best]),
                        "mm": self.world(best).round(2).tolist()})
        out.sort(key=lambda d: -d["geodesic_mm"])
        for i, d in enumerate(out):
            d["label"] = ("Farthest point (max geodesic)" if i == 0 else f"Farthest point of WT component {d['component']}")
        return out
