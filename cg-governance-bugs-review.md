# Component Governance Bug Review

**Date:** 2026-03-05
**Source:** ADO Query `e7192f5a-f112-426b-9807-5017e28369eb`
**Total Work Items:** 156 (all in "To Do" state)
**Unique Package/Version Combinations:** 122

## Summary

| Status | Count | % |
|--------|-------|---|
| Already fixed (not in any lockfile) | 81 | 66% |
| Still present in lockfile(s) | 41 | 34% |

---

## Still Present (Requires Action)

### Critical Severity

| WI ID | Package | CVE/Alert | Lockfile(s) |
|-------|---------|-----------|-------------|
| 59852 | fast-xml-parser@4.2.5 | CVE-2026-25896 | main |
| 50947 | katex@0.16.25 | OSL-3.0 license review | docs |
| 59686 | pm2@5.4.3 | AGPL-3.0 license review | server/historian, main, build-tools, server/gitrest, tools/api-markdown-documenter |

### High Severity

| WI ID | Package | CVE/Alert | Lockfile(s) |
|-------|---------|-----------|-------------|
| 45439 | glob@8.1.0 | CC-BY-SA-4.0 license review | 12 lockfiles (all except docs, tools/getkeys, common/build/build-common) |
| 53798 | glob@10.4.5 | CVE-2025-64756 | NOT FOUND (may be resolved) |
| 54397 | node-forge@1.3.1 | CVE-2025-12816 | main, docs |
| 54544 | jws@4.0.0 | CVE-2025-65945 | docs |
| 54545 | jws@3.2.2 | CVE-2025-65945 | server/historian, server/routerlicious, build-tools, server/gitrest, docs, common/lib/protocol-definitions, common/lib/common-utils |
| 55981 | systeminformation@5.27.11 | CVE-2025-68154 | server/routerlicious |
| 56320 | @langchain/core@0.3.78 | CVE-2025-68665 | NOT FOUND (may be resolved) |
| 54462 | validator@13.12.0 | CVE-2025-12758 | common/build/eslint-plugin-fluid, docs |
| 54463 | validator@8.2.0 | CVE-2025-12758 | NOT FOUND (may be resolved) |
| 48104 | ip@1.1.9 | CVE-2024-29415 | NOT FOUND (may be resolved) |
| 48525-48531 | axios@1.8.4, 0.30.0, 0.26.0, 0.26.1, 0.27.2, 0.28.1, 0.30.1 | CVE-2025-58754 | NOT FOUND (all resolved) |
| 46453-46454 | tar-fs@1.16.3, 2.1.1 | CVE-2025-48387 | NOT FOUND (may be resolved) |
| 49469-49470 | tar-fs@1.16.5, 2.1.3 | CVE-2025-59343 | NOT FOUND (may be resolved) |
| 57984 | tar@6.2.1 | CVE-2026-23745 | server/historian, server/routerlicious, build-tools, server/gitrest, common/lib/protocol-definitions, common/lib/common-utils |
| 58215 | tar@6.2.1 | CVE-2026-23950 | (same as above) |
| 58607 | tar@6.2.1 | CVE-2026-24842 | (same as above) |
| 59678 | tar@6.2.1 | CVE-2026-26960 | (same as above) |
| 61785 | tar@6.2.1 | GHSA-qffp-2rhf-9h96 | (same as above) |
| 59582-59589 | qs@6.13.1, 6.11.2, 6.14.0, 6.5.2, 6.10.1, 6.9.4, 6.7.0 | CVE-2025-15284 | qs@6.13.1: docs; qs@6.11.2: server/historian, server/routerlicious, server/gitrest; qs@6.14.0: build-tools; others: NOT FOUND |
| 59767-59768 | systeminformation@5.23.8 | CVE-2026-26280, CVE-2026-26318 | NOT FOUND (may be resolved) |
| 59775-59776 | systeminformation@5.30.7 | CVE-2026-26280, CVE-2026-26318 | NOT FOUND (may be resolved) |
| 59826-59827 | systeminformation@5.27.11 | CVE-2026-26280, CVE-2026-26318 | server/routerlicious |
| 59680 | fast-xml-parser@4.2.5 | CVE-2026-26278 | main |
| 60190-60230 | minimatch (various versions) | CVE-2026-27903, CVE-2026-27904 | minimatch@9.0.5: 14 lockfiles; @5.1.6: 12; @3.1.2: 9; @10.0.3: 8; @3.0.4: 13; @5.0.1: 1; @9.0.1: 1; others: NOT FOUND |
| 60278, 60288 | serialize-javascript@6.0.0, 6.0.2 | GHSA-5c6j-r48x-rmvq | 6.0.0: server/historian, server/routerlicious; 6.0.2: main |

### Medium Severity

| WI ID | Package | CVE/Alert | Lockfile(s) |
|-------|---------|-----------|-------------|
| 50686 | validator@13.12.0 | CVE-2025-56200 | common/build/eslint-plugin-fluid, docs |
| 50687 | validator@13.9.0 | CVE-2025-56200 | tools/api-markdown-documenter |
| 54398 | node-forge@1.3.1 | CVE-2025-66030 | main, docs |
| 54428 | mdast-util-to-hast@13.2.0 | CVE-2025-66400 | build-tools, tools/api-markdown-documenter, docs |
| 54310-54320 | @img/sharp-* (LGPL-3.0) | License review | @img/sharp-wasm32@0.34.5: build-tools; others: NOT FOUND |
| 53728-53730 | js-yaml@4.1.0, 3.14.1, 3.13.1 | CVE-2025-64718 | js-yaml@4.1.0: 12 lockfiles; @3.14.1: 7 lockfiles; @3.13.1: NOT FOUND |
| 58269-58271 | lodash@4.17.21, lodash-es@4.17.22, lodash-es@4.17.21 | CVE-2025-13465 | lodash@4.17.21: 14 lockfiles; lodash-es@4.17.22: main; lodash-es@4.17.21: docs |
| 42838-42841 | webpack-dev-server@4.15.2, 4.6.0 | CVE-2025-30359, CVE-2025-30360 | 4.15.2: main, docs; 4.6.0: NOT FOUND |
| 35836-35839 | http-proxy-middleware@2.0.7, 2.0.6 | CVE-2025-32996, CVE-2025-32997 | NOT FOUND |
| 49067, 49367 | bootstrap@3.4.1 | CVE-2025-1647, CVE-2024-6485 | NOT FOUND |
| 59584 | fastest-json-copy@1.0.1 | CVE-2022-41714 | NOT FOUND |
| 59585 | langsmith@0.3.73 | CVE-2026-25528 | main |
| 58791 | eslint@8.6.0 | CVE-2025-50537 | NOT FOUND |
| 59079-59084 | webpack@5.103.0, 5.101.3, 5.72.1 | CVE-2025-68458, CVE-2025-68157 | 5.103.0: server/historian, main, build-tools, server/gitrest, tools/api-markdown-documenter; others: NOT FOUND |
| 54425, 54429 | express@4.17.1, 4.21.2 | CVE-2024-51999 | 4.17.1: server/historian; 4.21.2: server/historian, server/routerlicious, main, server/gitrest, docs |

### Low Severity

| WI ID | Package | CVE/Alert | Lockfile(s) |
|-------|---------|-----------|-------------|
| 42834-42835 | brace-expansion@2.0.1, 1.1.11 | CVE-2025-5889 | common/build/eslint-plugin-fluid, common/build/eslint-config-fluid |
| 44309 | on-headers@1.0.2 | CVE-2025-7339 | server/historian, server/routerlicious, main, server/gitrest, docs |
| 46065 | tmp@0.0.33 | CVE-2025-54798 | server/historian, server/routerlicious, main, build-tools, server/gitrest, docs, common/lib/common-utils |
| 57898-57900, 57980, 60040 | diff@8.0.2, 5.2.0, 3.5.0, 5.0.0, 7.0.0 | GHSA-73rr-hh4g-fpgx, CVE-2026-24001 | diff@8.0.2: 7 lockfiles; @5.2.0: 10; @3.5.0: main; @5.0.0: common/build/eslint-config-fluid; @7.0.0: 6 lockfiles |
| 57979 | quill@2.0.3 | CVE-2025-15056 | main |
| 59007 | @smithy/config-resolver@2.2.0 | GHSA-6475-r3vj-m8vf | server/historian, server/routerlicious |
| 60210 | fast-xml-parser@4.2.5 | CVE-2026-27942 | main |
| 61786 | @tootallnate/once@2.0.0 | CVE-2026-3449 | server/historian, server/routerlicious, main, build-tools, server/gitrest, common/lib/protocol-definitions, common/lib/common-utils |

---

## Already Fixed (Not in Lockfiles) - 81 work items

These work items reference package versions no longer present in any lockfile and can be closed.

| WI ID | Package | CVE/Alert | Severity |
|-------|---------|-----------|----------|
| 5163 | got@9.6.0 | CVE-2022-33987 | Medium |
| 26473 | nanoid@3.3.7 | CVE-2024-55565 | Low |
| 26474 | nanoid@3.3.3 | CVE-2024-55565 | Low |
| 27635 | validator@8.2.0 | CVE-2021-3765 | Medium |
| 27636 | webpack@5.72.1 | CVE-2023-28154 | Critical |
| 27637 | ws@7.5.8 | CVE-2024-37890 | High |
| 27638 | vue@2.7.14 | CVE-2024-9506 | Low |
| 27639 | postcss@8.4.30 | CVE-2023-44270 | Medium |
| 27640 | underscore@1.6.0 | CVE-2021-23358 | Critical |
| 27641 | socket.io@4.5.0 | CVE-2024-38355 | Medium |
| 27642 | webpack@5.72.1 | CVE-2024-43788 | Medium |
| 27811 | postcss@7.0.39 | CVE-2023-44270 | Medium |
| 27812-27816 | elliptic@6.5.4 | CVE-2024-42459/61/60, CVE-2024-48948/49 | Low |
| 27817 | yargs-parser@8.1.0 | CVE-2020-7608 | Medium |
| 27818 | webpack-dev-middleware@3.7.3 | CVE-2024-29180 | High |
| 27819 | markdown-it@10.0.0 | CVE-2022-21670 | Medium |
| 27820 | xmldom@0.1.19 | CVE-2022-39353 | Critical |
| 27821 | yargs-parser@7.0.0 | CVE-2020-7608 | Medium |
| 27823 | postcss@5.2.18 | CVE-2023-44270 | Medium |
| 27824 | babel-traverse@6.26.0 | CVE-2023-45133 | Critical |
| 27825 | ws@3.3.2 | CVE-2024-37890 | High |
| 27826 | trim-newlines@1.0.0 | CVE-2021-33623 | High |
| 27827 | marked@0.4.0 | WS-2019-0209 | Medium |
| 27828 | tar@6.2.0 | CVE-2024-28863 | Medium |
| 27829 | hoek@5.0.4 | CVE-2020-36604 | High |
| 27830 | chrome-launcher@0.11.2 | CVE-2020-7645 | Critical |
| 27831-27832 | xmldom@0.1.19 | CVE-2021-21366, CVE-2021-32796 | Medium |
| 27848 | ws@7.5.3 | CVE-2024-37890 | High |
| 32030, 32062-32063, 32437 | axios@1.7.7, 0.26.0, 0.26.1, 0.27.2 | CVE-2025-27152 | High |
| 34361, 34395, 34579-34580, 34979-34980, 35447-35448, 35543-35544, 38054-38055 | vite@4.5.5, 4.5.9, 4.5.10, 4.5.12 | Multiple CVEs | Medium |
| 35180, 35277 | @babel/runtime@7.22.5, 7.26.0 | CVE-2025-27789 | Medium |
| 35836-35839 | http-proxy-middleware@2.0.7, 2.0.6 | CVE-2025-32996, CVE-2025-32997 | Medium |
| 42840-42841 | webpack-dev-server@4.6.0 | CVE-2025-30359, CVE-2025-30360 | Medium |
| 46453-46454 | tar-fs@1.16.3, 2.1.1 | CVE-2025-48387 | High |
| 48104 | ip@1.1.9 | CVE-2024-29415 | High |
| 48525-48531 | axios (multiple versions) | CVE-2025-58754 | High |
| 49067, 49367 | bootstrap@3.4.1 | CVE-2025-1647, CVE-2024-6485 | Medium |
| 49469-49470 | tar-fs@1.16.5, 2.1.3 | CVE-2025-59343 | High |
| 50595 | validator@8.2.0 | CVE-2025-56200 | Medium |
| 53730 | js-yaml@3.13.1 | CVE-2025-64718 | Medium |
| 54311-54320 | @img/sharp-* (11 of 12 entries) | LGPL-3.0 license review | Medium |
| 55982 | systeminformation@5.23.8 | CVE-2025-68154 | High |
| 58791 | eslint@8.6.0 | CVE-2025-50537 | Medium |
| 59080, 59082, 59084 | webpack@5.101.3, 5.72.1 | CVE-2025-68157 | Low |
| 59081, 59083 | webpack@5.101.3, 5.72.1 | CVE-2025-68458 | Low |
| 59584 | fastest-json-copy@1.0.1 | CVE-2022-41714 | Medium |
| 59767-59768 | systeminformation@5.23.8 | CVE-2026-26280, CVE-2026-26318 | High |
| 59775-59776 | systeminformation@5.30.7 | CVE-2026-26280, CVE-2026-26318 | High |
| 60192-60193 | minimatch@9.0.4 | CVE-2026-27903, CVE-2026-27904 | High |
| 60219-60220 | minimatch@10.1.1 | CVE-2026-27903, CVE-2026-27904 | High |
| 60229-60230 | minimatch@10.2.1 | CVE-2026-27903, CVE-2026-27904 | High |

---

## Top Priority Packages (Still Present, Grouped by Impact)

### 1. tar@6.2.1 — 5 High CVEs (6 lockfiles)
Multiple CVEs across 2026. Present in server/historian, server/routerlicious, build-tools, server/gitrest, common/lib/protocol-definitions, common/lib/common-utils.

### 2. minimatch (multiple versions) — 2 High CVEs per version (up to 14 lockfiles)
Pervasive across the entire repo. Versions 9.0.5, 5.1.6, 3.1.2, 10.0.3, 3.0.4 are all still present.

### 3. fast-xml-parser@4.2.5 — 1 Critical + 1 High + 1 Low (main lockfile)
PR #26648 (mongodb bump) should resolve this for the shipped dependency. Remaining presence may be via devDependency chain.

### 4. lodash@4.17.21 — Medium CVE (14 lockfiles)
Extremely pervasive. Upgrading would be a large effort.

### 5. systeminformation@5.27.11 — 1 High + 2 High CVEs (server/routerlicious)
Only in one lockfile, potentially straightforward to update.

### 6. pm2@5.4.3 — Critical (AGPL-3.0 license, 5 lockfiles)
License compliance issue, not a security vulnerability.

### 7. serialize-javascript@6.0.0/6.0.2 — High (3 lockfiles)
Present in server/historian, server/routerlicious, and main.

### 8. qs (multiple versions) — High CVE (4 lockfiles)
qs@6.11.2 in server/*, qs@6.13.1 in docs, qs@6.14.0 in build-tools.

### 9. js-yaml@4.1.0/3.14.1 — Medium CVE (12 and 7 lockfiles respectively)
Very pervasive, but medium severity.

### 10. diff (multiple versions) — Low (widespread)
Low severity but present in many lockfiles.
