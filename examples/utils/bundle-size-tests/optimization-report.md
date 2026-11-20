# Client bundle size investigation

Baseline: clean `bd9ed94824f`. Fresh production build complete: 18 entries, 25 JS assets, no duplicate-package errors.
Four changes retained locally: native private rebaser methods, const-enum erasure, opt-in forest validation, and browser encoding without the buffer class.
Together they reduce **SharedTree from 457,510 to 454,872 parsed bytes and from 130,166 to 129,606 gzip bytes**.
No measured asset grew. Trial changes to production errors, assertions and the experimental package are not in the retained diff.

## Combined results

These are measurements from a fresh build of all four changes together, not a sum of the isolated results.
Negative numbers mean smaller assets. The inventory includes overlapping standalone app scenarios; its sum is **not** a per-app download saving.

| Asset | Parsed delta (bytes) | Gzip delta (bytes) |
| --- | ---: | ---: |
| sharedTree | -2,638 | -560 |
| fluidFramework | -2,638 | -548 |
| fluidFrameworkAllAlpha | -2,274 | -366 |
| odspPrefetchSnapshot | -919 | -280 |
| aqueduct | -56 | -32 |
| azureClient | -56 | -29 |
| containerRuntime | -56 | -28 |
| directory | -62 | -30 |
| experimentalSharedTree | -62 | -26 |
| loader | -56 | -28 |
| map | -62 | -27 |
| matrix | -62 | -32 |
| odspClient | -48 | -27 |
| odspDriver | -48 | -30 |
| sharedString | -62 | -28 |
| connectionState, debugAssert, sharedTreeAttributes and all seven non-entry assets | 0 each | 0 each |
| **All 25 assets** | **-9,099** | **-2,071** |

Inventory totals: 5,026,634 → 5,017,535 parsed bytes; 1,402,113 → 1,400,042 gzip bytes.

## Experiments and decisions

| Candidate | What to check | Experiment / decision |
| --- | --- | --- |
| Narrow third-party imports | Can SharedTree's codec builders avoid TypeBox's parser by importing more narrowly? | Inspected: the builders already use the public `typebox/type` subpath; the package does not export individual builder modules. Do not rely on private paths. |
| Simplify the existing TypeBox workaround | The analyzer attributes bytes to the parser even with the workaround. Could we now use the public string-key `Record` builder at no cost? | **Reverted.** Using `Type.Record(Type.String(), …)` added 35,296 parsed / 9,170 gzip bytes to both SharedTree and fluidFramework, and 35,395 / 9,093 to all-alpha. The baseline source map has no generated segments from the parser. Concatenated-module treemap estimates alone are misleading here. |
| Remove incidental runtime dependencies | The browser `stringToBuffer` and base64 helpers delegate to the entire `IsoBuffer` class. | **Keep.** Let both the helpers and the class call the encoding operations directly. Alone: -1,725 parsed / -680 gzip bytes across 15 entries; ODSP prefetch alone loses 919 / 280 bytes. Other assets do not grow. Client-utils ESM suite: 81 tests passed. |
| Make unused initialization removable | The telemetry session-storage provider constructs a `Lazy` at module scope. Its constructor only stores a callback. | Tried a pure annotation at this allocation. Reverted: +179 parsed / -17 gzip bytes across the inventory, including +128 / +6 for loader. No entry lost even 20 gzip bytes. |
| Deduplicate dependencies | Are multiple versions of a large library shipped together? | Inspected: the production checker found none. No resolution override or lockfile deduplication experiment warranted. |
| Lazy loading or changing webpack settings | Could downloads be deferred or compressed differently? | Not tried. The summarizer already has its own guarded lazy chunk. Moving synchronous Tree functionality behind an async boundary would need API and latency measurements; tuning only the test config would not shrink consumer bundles. |
| Specialize the experimental tree revision cache | `lru-cache` and `yallist` supply recency ordering for an existing sorted cache. | Tried before scope clarification. -7,823 parsed / -2,214 gzip on the experimental entry. Reverted: not a priority and no benefit to production SharedTree. |
| Make internal rebaser method names minifiable | Source maps attribute about 32 KB of the SharedTree asset to `modularChangeFamily.ts`. TypeScript `private` retains full property names in JS. | **Keep.** 33 private implementation methods on `ModularChangeFamily`. SharedTree -1,341 parsed / -139 gzip; fluidFramework -1,341 / -140; all-alpha -1,307 / -133. All other assets unchanged. Tree already targets ES2022; 285 modular-schema tests passed. |
| Isolate optional forest diagnostics | Move the reference forest's whole-forest schema check out of the default implementation; pass it in from the expensive-debug provider, including on clones. | **Keep.** SharedTree -680 / -221, fluidFramework -680 / -216, all-alpha -365 / -59. Debug builds of the provider still validate; the default no longer retains the validation method or its decorator. |
| Replace the B-tree union algorithm | `extended/decompose.js` accounts for about 6.7 KB of mapped bytes. | Not recommended without performance evidence: the specialized union shares subtrees; inserting every entry into a copy can penalize large documents. Not tried. |
| Eliminate decorator boilerplate | TypeScript emits a descriptor per decorated checkout method. | Not tried: the breaker decorators also mark wrapper functions to prevent double wrapping and preserve diagnostic names. Do not remove guards to save bytes. |
| Tweak TypeScript emit | Tree uses `importHelpers` already. Six `const enum` declarations are preserved as runtime objects even though references inside Tree are inlined. | **Keep** enum erasure: SharedTree -555 / -172, fluidFramework -555 / -163, all-alpha -550 / -175. None of the six enum objects is exported from a supported package entry. The supported JS target does not change. |
| Convert redundant assertions to debug assertions | Two post-navigation checks in the uniform chunk cursor recompute the selected index. | Tried both: -56 parsed bytes each on SharedTree, fluidFramework and all-alpha (-12, -12, -14 gzip). 172 uniform-chunk tests passed. Keep the existing production checks: the gain is small relative to detecting bad navigation before a subsequent edit. No weakening of input or corruption checks. |
| Tag usage errors and prune message builders | Preserve the error type and throw site, but ship a short lookup code instead of eager prose and interpolation. | Prototyped 30 checkout messages (literals and templates) with provisional short codes plus `appendDebugMessage(code, () => message)`. SharedTree -1,723 / -445, fluidFramework -1,723 / -427, all-alpha -1,728 / -435. **Not retained**: users lose actionable messages in production. Worth a separate design with stable generated codes, a versioned public lookup, and a migration for telemetry and consumers matching error text. Dynamic-only and forwarded errors were not changed. |

## Reproduction and validation

Node 24.15.0, pnpm 11.27.0, webpack 5.109.0, installed workspace dependencies.
Start with built client dependencies as in the [bundle testing guide](../../../docs/content/Contributing/Testing/Bundle-Size-Test.md).
For each trial, rebuild the changed package's ESM with `npm run build:esm` before bundling: the entries resolve emitted packages, not their TypeScript sources.
From this directory, run `NODE_OPTIONS=--max-old-space-size=8192 npm run webpack -- --config-name bundle-analysis`.
Save `bundleAnalyzerJson/analyzer.json` for each revision and join the top-level rows by `label`, subtracting baseline `parsedSize` and `gzipSize`.
For the retained combination run `npm run webpack` instead, which also rebuilds the four forest reachability probes.
These probes are tested separately, not counted as PR size assets.

All five bundle regression tests passed, including a new reachability check for the optional forest validation module.
The client-utils ESM suite (81 tests) and the modular-schema suite (285 tests) passed with the retained combination.
The selected forest, tree view and SharedTree suites reported 440 passing, 244 pending and one failure: the aborted-transaction test could not start a second default ephemeral service.
That test passed by itself in a fresh process. The full monorepo suite was not run.
