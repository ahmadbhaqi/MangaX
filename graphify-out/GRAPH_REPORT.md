# Graph Report - src  (2026-07-19)

## Corpus Check
- Corpus is ~5,288 words - fits in a single context window. You may not need a graph.

## Summary
- 35 nodes · 53 edges · 7 communities (4 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Native Mobile Bridge
- MangaDex Data Pipeline
- Application Interface
- Library Persistence
- Hero Visual System
- React Brand Asset
- Vite Brand Asset

## God Nodes (most connected - your core abstractions)
1. `apiFetch()` - 5 edges
2. `fetchMangaList()` - 5 edges
3. `getLibrary()` - 4 edges
4. `getAllTags()` - 4 edges
5. `fetchMangaChapters()` - 4 edges
6. `Layered Panels Hero Illustration` - 4 edges
7. `App()` - 3 edges
8. `buildUrl()` - 3 edges
9. `getRelationship()` - 3 edges
10. `sanitizeFilename()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Layered Panel Composition** — src_assets_hero_upper_rounded_panel, src_assets_hero_lower_purple_panel, src_assets_hero_vertical_guide_lines [EXTRACTED 1.00]

## Communities (7 total, 3 thin omitted)

### Community 0 - "Native Mobile Bridge"
Cohesion: 0.24
Nodes (4): downloadChapter(), getOfflinePages(), imageCache, sanitizeFilename()

### Community 1 - "MangaDex Data Pipeline"
Cohesion: 0.36
Nodes (8): apiFetch(), buildUrl(), fetchChapterPages(), fetchMangaChapters(), fetchMangaList(), fetchTags(), getAllTags(), getRelationship()

### Community 3 - "Library Persistence"
Cohesion: 0.50
Nodes (5): addToLibrary(), getLibrary(), isInLibrary(), removeFromLibrary(), saveLibraryData()

### Community 4 - "Hero Visual System"
Cohesion: 0.70
Nodes (5): Layered Interface Concept, Layered Panels Hero Illustration, Lower Purple Panel, Upper Rounded Panel, Vertical Dotted Guide Lines

## Knowledge Gaps
- **4 isolated node(s):** `imageCache`, `Layered Interface Concept`, `React Logo`, `Vite Logo`
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiFetch()` connect `MangaDex Data Pipeline` to `Native Mobile Bridge`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `fetchMangaList()` connect `MangaDex Data Pipeline` to `Native Mobile Bridge`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `imageCache`, `Layered Interface Concept`, `React Logo` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._