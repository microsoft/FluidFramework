/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { compareJsonReports } from "./compareJsonReports.js";

/**
 * A single node from webpack-bundle-analyzer's JSON report
 * (`analyzerMode: "json"`). Each top-level node is an emitted asset;
 * `parsedSize`/`gzipSize` are the minified and gzipped sizes of the asset as it
 * ships, and `isInitialByEntrypoint` maps each entrypoint the asset is an
 * initial chunk of to `true`.
 */
type AnalyzerNode = BundleAnalyzerPlugin.JsonReportItem;

/**
 * Options for {@link compareBundles}.
 */
export interface CompareBundlesOptions {
	/** Parent directory containing analyzer.json files at `{label}/analyzer.json`. */
	readonly analysisDirectory: string;
	/** Directory where the `.txt` and `.json` comparison reports are written. */
	readonly outputDirectory: string;
	/** Label subdirectory under {@link CompareBundlesOptions.analysisDirectory} holding the base-side bundle stats. */
	readonly baseLabel: string;
	/** Label subdirectory under {@link CompareBundlesOptions.analysisDirectory} holding the current-side bundle stats. */
	readonly currentLabel: string;
}

interface AssetComparison {
	name: string;
	baseParsedSize: number;
	currentParsedSize: number;
	diff: number;
}

interface GzipRow {
	name: string;
	baseGzipSize: number;
	currentGzipSize: number;
	diff: number;
}

/**
 * One row of the entrypoint totals table. Unlike the synthetic composition
 * buckets ({@link ComparisonReport.packageBuckets}), every row here corresponds
 * to a *real* webpack entrypoint — i.e. an actual bundle a consumer downloads,
 * with shared modules deduplicated within that single bundle. `entrypointName`
 * is the webpack entry key (e.g. `sharedTree`, `azureClient`, or the aggregate
 * `fluidFrameworkAll`), and the sizes are that bundle's total parsed bytes.
 *
 * Because each row is a self-contained shipped bundle, these sizes are
 * tree-shaking-honest: a module dropped from an entrypoint shrinks that row even
 * if other entrypoints still ship it. The flip side is that rows intentionally
 * overlap (a module shared by N entrypoints is counted in all N), so the rows
 * must NOT be summed to get a bundle-wide total — use the dedicated
 * `fluidFrameworkAll` aggregate entrypoint for a single real total instead.
 */
interface EntrypointRow {
	entrypointName: string;
	baseSize: number;
	currentSize: number;
	diff: number;
}

/**
 * Per-package parsed-size comparison row. `name` is the owning npm package of
 * the contributing modules (e.g. `@fluidframework/tree`, `@sinclair/typebox`),
 * or a synthetic bucket label (e.g. `Fluid Framework (incl. tree)`).
 */
interface PackageSizeRow {
	name: string;
	baseSize: number;
	currentSize: number;
	diff: number;
}

/** Structured comparison report written to the JSON output file. */
interface ComparisonReport {
	/** ISO timestamp of when the comparison was generated */
	comparedAt: string;
	/** Label subdirectory holding the base-side bundle stats */
	baseLabel: string;
	/** Label subdirectory holding the current-side bundle stats */
	currentLabel: string;
	/** Parent directory containing the per-label bundle stats */
	analysisDirectory: string;
	/** Per-asset parsed-size comparison rows */
	assets: AssetComparison[];
	/** Gzip size comparison rows for assets whose parsed size changed */
	gzipChangedAssets: GzipRow[];
	/**
	 * Per-entrypoint total parsed-size comparison rows. Each row maps to a real
	 * webpack entrypoint (a real shipped bundle); see {@link EntrypointRow}. Rows
	 * overlap and must not be summed — the aggregate `fluidFrameworkAll`
	 * entrypoint provides the single deduplicated bundle-wide total.
	 */
	entrypoints: EntrypointRow[];
	/**
	 * Headline buckets, each pinned to a real entrypoint (never summed across
	 * entrypoints): SharedTree from `sharedTree`, Fluid Framework from
	 * `fluidFrameworkAll`, each available with and without third-party deps.
	 * Defined by {@link bucketDefinitions}.
	 */
	packageBuckets: PackageSizeRow[];
	/**
	 * Full per-package parsed-size breakdown (one row per owning package),
	 * sorted by current size descending. Scoped to the `fluidFrameworkAll`
	 * aggregate entrypoint and deduplicated by module, so each package is counted
	 * once as it appears in that single real bundle.
	 */
	packages: PackageSizeRow[];
}

function sanitizeForFileName(value: string): string {
	return value.replaceAll(/[^\w.-]/g, "_");
}

/**
 * Loads webpack-bundle-analyzer's JSON report for a label. If the file does not
 * exist, returns an empty array and logs a warning.
 */
function loadAnalyzer(analysisDirectory: string, label: string): AnalyzerNode[] {
	const analyzerFilePath = resolve(analysisDirectory, label, "analyzer.json");
	if (!existsSync(analyzerFilePath)) {
		console.warn(
			`Warning: Analyzer report not found at "${analyzerFilePath}". ` +
				`Returning empty stats (all assets will be treated as size 0).`,
		);
		return [];
	}
	return JSON.parse(readFileSync(analyzerFilePath, "utf8")) as AnalyzerNode[];
}

/** Whether an asset name is an emitted `.js` asset (excluding source maps). */
function isJsAssetName(name: string): boolean {
	return name.endsWith(".js") && !name.endsWith(".map");
}

/** Whether an analyzer node is an emitted `.js` asset (excluding source maps). */
function isJsAsset(node: AnalyzerNode): boolean {
	return isJsAssetName(node.label);
}

/**
 * Sums each entrypoint's initial-chunk parsed sizes. analyzer.json tags every
 * asset with the entrypoints it is an initial chunk of via isInitialByEntrypoint.
 */
function entrypointSizes(nodes: AnalyzerNode[]): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const node of nodes.filter(isJsAsset)) {
		for (const [entrypointName, isInitial] of Object.entries(
			node.isInitialByEntrypoint ?? {},
		)) {
			if (isInitial !== true) continue;
			totals[entrypointName] = (totals[entrypointName] ?? 0) + (node.parsedSize ?? 0);
		}
	}
	return totals;
}

/**
 * Strips webpack's module-concatenation (scope-hoisting) wrapper prefix from a
 * module `path`, returning the path of the *real* module.
 *
 * When webpack concatenates modules, every concatenated leaf's `path` is
 * prefixed with the concatenation root, e.g.:
 *
 * ```
 * ./../../packages/framework/fluid-framework/lib/index.js + 268 modules (concatenated)/../../packages/dds/tree/lib/treeFactory.js
 * ```
 *
 * The text before the last `(concatenated)/` is the wrapper (the barrel that
 * pulled the module in); the text after it is the real module. Naively reading
 * the package from such a path picks up the wrapper (here `fluid-framework`)
 * instead of the true owner (`tree`), so all hoisted modules collapse onto the
 * barrel package. Anchoring on the last `(concatenated)/` recovers the real
 * module path. Paths without the marker are returned unchanged.
 */
function stripConcatenationWrapper(modulePath: string): string {
	const normalized = modulePath.replace(/\\/g, "/");
	const marker = "(concatenated)/";
	const markerIndex = normalized.lastIndexOf(marker);
	return markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized;
}

/**
 * Extracts the owning npm package name from a webpack-bundle-analyzer module
 * `path`. Handles the three shapes that appear in this repo's bundles:
 *
 * - **Third-party (pnpm):** `.../node_modules/.pnpm/<key>/node_modules/<pkg>/...`
 *   — the name after the *last* `node_modules/` is used, so a package's own
 *   nested dependencies are attributed to themselves. Scoped packages keep
 *   their `@scope/name`.
 * - **Workspace packages:** `.../packages/<group>/<name>/...` — these are the
 *   Fluid Framework source packages, published as `@fluidframework/<name>`.
 * - **App/entry code:** anything else (e.g. the bundle-size-tests harness's own
 *   `./src/*.ts` entry modules) is grouped under `(app/entry)`.
 *
 * Concatenated-module wrapper prefixes are stripped first (see
 * {@link stripConcatenationWrapper}) so scope-hoisted modules are attributed to
 * their true owning package rather than the concatenating barrel.
 */
function packageFromModulePath(modulePath: string): string {
	const normalized = stripConcatenationWrapper(modulePath);
	const nodeModulesIndex = normalized.lastIndexOf("node_modules/");
	if (nodeModulesIndex >= 0) {
		const rest = normalized.slice(nodeModulesIndex + "node_modules/".length);
		const parts = rest.split("/");
		return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
	}
	const packagesIndex = normalized.indexOf("packages/");
	if (packagesIndex >= 0) {
		// Workspace layout: packages/<group>/<name>/lib/...
		const parts = normalized.slice(packagesIndex + "packages/".length).split("/");
		if (parts.length >= 2) return `@fluidframework/${parts[1]}`;
	}
	return "(app/entry)";
}

/**
 * Produces a stable identity for a module so the same source module reached via
 * different entrypoints (webpack prefixes the path with the concatenating
 * entry, e.g. `./src/sharedTree.ts + 384 modules (concatenated)/...`) collapses
 * to a single key. The concatenation wrapper prefix is stripped first (see
 * {@link stripConcatenationWrapper}), then anchoring at `node_modules/` or
 * `packages/` removes any remaining per-entry prefix, giving "unique module"
 * dedup semantics.
 */
function canonicalModuleKey(modulePath: string): string {
	const normalized = stripConcatenationWrapper(modulePath);
	const nodeModulesIndex = normalized.lastIndexOf("node_modules/");
	if (nodeModulesIndex >= 0) return normalized.slice(nodeModulesIndex);
	const packagesIndex = normalized.indexOf("packages/");
	if (packagesIndex >= 0) return normalized.slice(packagesIndex);
	return normalized;
}

/**
 * Walks a set of asset nodes' `groups` module trees and sums parsed sizes per
 * owning package. Modules are deduplicated by {@link canonicalModuleKey} using
 * a single shared `seen` set, so a module reached more than once within this
 * asset set is counted exactly once.
 */
function accumulatePackageSizes(assets: AnalyzerNode[]): Map<string, number> {
	const perPackage = new Map<string, number>();
	const seen = new Set<string>();

	const visit = (node: AnalyzerNode): void => {
		if (node.groups !== undefined && node.groups.length > 0) {
			for (const child of node.groups) visit(child);
			return;
		}
		// Leaf module node.
		if (node.path === undefined) return;
		const key = canonicalModuleKey(node.path);
		if (seen.has(key)) return;
		seen.add(key);
		const packageName = packageFromModulePath(node.path);
		perPackage.set(packageName, (perPackage.get(packageName) ?? 0) + (node.parsedSize ?? 0));
	};

	for (const node of assets) {
		visit(node);
	}
	return perPackage;
}

/** Entrypoint asset for the full deduplicated Fluid Framework footprint (`bundle-size-tests/src/fluidFrameworkAll.ts`). */
const aggregateEntrypointAsset = "fluidFrameworkAll.js";

/** Entrypoint asset for SharedTree's own bundle (`bundle-size-tests/src/sharedTree.ts`). */
const treeEntrypointAsset = "sharedTree.js";

/**
 * Per-package parsed sizes for a single named entrypoint asset. Walks only that
 * one asset's module tree, deduping shared modules within it, so every package
 * is counted exactly once as it actually appears in that real bundle. Returns an
 * empty map (and warns) if the asset is missing, rather than falling back to a
 * misleading whole-bundle total.
 */
function packageSizesForAsset(nodes: AnalyzerNode[], assetLabel: string): Map<string, number> {
	const asset = nodes.find((node) => node.label === assetLabel);
	if (asset === undefined) {
		console.warn(`Warning: entrypoint asset "${assetLabel}" not found; reporting it as size 0.`);
		return new Map();
	}
	return accumulatePackageSizes([asset]);
}

/** Diffs two per-package size maps into sorted {@link PackageSizeRow}s. */
function diffPackageSizes(
	base: Map<string, number>,
	current: Map<string, number>,
): PackageSizeRow[] {
	return [...new Set([...base.keys(), ...current.keys()])]
		.map((name) => {
			// Missing on a side is treated as size 0 (added/removed package).
			const baseSize = base.get(name) ?? 0;
			const currentSize = current.get(name) ?? 0;
			return { name, baseSize, currentSize, diff: currentSize - baseSize };
		})
		.sort((a, b) => b.currentSize - a.currentSize || a.name.localeCompare(b.name));
}

/** Whether a package name belongs to Fluid Framework (any `@fluidframework/*` or `@fluid-*`). */
function isFluidPackage(name: string): boolean {
	return name.startsWith("@fluidframework/") || name.startsWith("@fluid-");
}

/** Running parsed-size accumulator (base/current/diff) for a bucket. */
interface SizeAccumulator {
	baseSize: number;
	currentSize: number;
	diff: number;
}

function addInto(acc: SizeAccumulator, row: PackageSizeRow): void {
	acc.baseSize += row.baseSize;
	acc.currentSize += row.currentSize;
	acc.diff += row.diff;
}

/** Whether a package's bytes are third-party (not a Fluid library, not harness code). */
function isThirdPartyPackage(name: string): boolean {
	return !isFluidPackage(name) && name !== "(app/entry)";
}

/**
 * One headline bucket: which entrypoint to measure, and whether to fold in that
 * bundle's third-party deps on top of its Fluid Framework bytes. Add a row to
 * {@link bucketDefinitions} to add a bucket — the rendering is fully
 * data-driven.
 */
interface BucketDefinition {
	label: string;
	/** Entrypoint asset whose deduplicated module tree this bucket is measured from. */
	asset: string;
	/** Whether to also include every third-party package in the same bundle. */
	withThirdParty: boolean;
}

/**
 * Headline buckets, each pinned to a real entrypoint — never summed across
 * entrypoints, which would double-count shared modules. SharedTree is measured
 * from its own `sharedTree` bundle; Fluid Framework from the `fluidFrameworkAll`
 * aggregate bundle. Each bucket counts every Fluid Framework package in its
 * bundle (the entrypoint's full Fluid footprint, not just one package); a
 * `+ 3rd-party deps` row also folds in every third-party package in that same
 * bundle. Third-party bytes can't be split between libraries (the flat
 * per-package data has no dependency graph). Harness code is always excluded
 * (see {@link isThirdPartyPackage}).
 */
const bucketDefinitions: readonly BucketDefinition[] = [
	{
		label: "SharedTree + 3rd-party deps",
		asset: treeEntrypointAsset,
		withThirdParty: true,
	},
	{
		label: "SharedTree",
		asset: treeEntrypointAsset,
		withThirdParty: false,
	},
	{
		label: "Fluid Framework + 3rd-party deps",
		asset: aggregateEntrypointAsset,
		withThirdParty: true,
	},
	{
		label: "Fluid Framework",
		asset: aggregateEntrypointAsset,
		withThirdParty: false,
	},
];

/**
 * Computes the headline buckets from {@link bucketDefinitions}. `rowsForAsset`
 * returns the entrypoint-scoped, diffed per-package rows for a given asset.
 */
function bucketPackageSizes(
	rowsForAsset: (asset: string) => PackageSizeRow[],
): PackageSizeRow[] {
	return bucketDefinitions.map((def) => {
		const acc: SizeAccumulator = { baseSize: 0, currentSize: 0, diff: 0 };
		for (const row of rowsForAsset(def.asset)) {
			if (isFluidPackage(row.name) || (def.withThirdParty && isThirdPartyPackage(row.name))) {
				addInto(acc, row);
			}
		}
		return { name: def.label, ...acc };
	});
}

/**
 * Computes a structured comparison between the base and current bundles.
 * Pure data: reads each side's `analyzer.json` (webpack-bundle-analyzer's JSON
 * report) and does no other I/O. Parsed and gzip sizes come straight from that
 * report, so no webpack stats decompression or on-disk gzipping is needed.
 *
 * The per-asset size diff is produced by the shared {@link compareJsonReports}
 * primitive; this function adds the JS-asset filter, gzip-changed rows, and
 * per-entrypoint aggregation (which needs the raw `isInitialByEntrypoint` data
 * not carried by the comparison's `BundleData`).
 */
function computeComparison(options: CompareBundlesOptions): ComparisonReport {
	const { baseLabel, currentLabel, analysisDirectory } = options;

	const baseNodes = loadAnalyzer(analysisDirectory, baseLabel);
	const currentNodes = loadAnalyzer(analysisDirectory, currentLabel);

	// Shared primitive: per-asset { base?, compare? } size data keyed by asset
	// label. It filters to `isAsset` entries; we further restrict to JS assets
	// (excluding source maps) below to match this report's scope.
	const bundleComparison = compareJsonReports(baseNodes, currentNodes);

	const assets: AssetComparison[] = Object.keys(bundleComparison)
		.filter((name) => isJsAssetName(name))
		.sort()
		.map((name) => {
			const { base, compare } = bundleComparison[name];
			const baseParsedSize = base?.parsedSize ?? 0;
			const currentParsedSize = compare?.parsedSize ?? 0;
			return {
				name,
				baseParsedSize,
				currentParsedSize,
				diff: currentParsedSize - baseParsedSize,
			};
		});

	const gzipChangedAssets: GzipRow[] = assets
		.filter((row) => row.diff !== 0)
		.map((row) => {
			// Missing assets are treated as size 0: an asset present in only one revision
			// (e.g. webpack auto-generated vendor chunks whose hash-based names change)
			// represents a genuine delta, not missing data.
			const { base, compare } = bundleComparison[row.name];
			const baseGzipSize = base?.gzipSize ?? 0;
			const currentGzipSize = compare?.gzipSize ?? 0;
			return {
				name: row.name,
				baseGzipSize,
				currentGzipSize,
				diff: currentGzipSize - baseGzipSize,
			};
		});

	// Sum each entrypoint's initial-chunk parsed sizes. This reads the raw nodes
	// directly because `isInitialByEntrypoint` is not part of the comparison's
	// per-asset `BundleData`.
	const baseEntrypoints = entrypointSizes(baseNodes);
	const currentEntrypoints = entrypointSizes(currentNodes);
	const entrypoints: EntrypointRow[] = [
		...new Set([...Object.keys(baseEntrypoints), ...Object.keys(currentEntrypoints)]),
	]
		.filter((entrypointName) => !/^\d/.test(entrypointName))
		.sort()
		.map((entrypointName) => {
			const baseSize = baseEntrypoints[entrypointName] ?? 0;
			const currentSize = currentEntrypoints[entrypointName] ?? 0;
			return {
				entrypointName,
				baseSize,
				currentSize,
				diff: currentSize - baseSize,
			};
		});

	// Per-package parsed-size breakdowns, each scoped to a single real
	// entrypoint (not a sum over entrypoints). Cached per asset because each
	// entrypoint feeds more than one headline bucket. Each walk dedupes modules
	// within its asset before the two sides are diffed.
	const rowsByAsset = new Map<string, PackageSizeRow[]>();
	const rowsForAsset = (asset: string): PackageSizeRow[] => {
		let rows = rowsByAsset.get(asset);
		if (rows === undefined) {
			rows = diffPackageSizes(
				packageSizesForAsset(baseNodes, asset),
				packageSizesForAsset(currentNodes, asset),
			);
			rowsByAsset.set(asset, rows);
		}
		return rows;
	};
	const packageBuckets = bucketPackageSizes(rowsForAsset);
	const packages = rowsForAsset(aggregateEntrypointAsset);

	return {
		comparedAt: new Date().toISOString(),
		baseLabel,
		currentLabel,
		analysisDirectory,
		assets,
		gzipChangedAssets,
		entrypoints,
		packageBuckets,
		packages,
	};
}

/** Formats a signed diff as "-", "+N", or "-N". */
function formatDiff(diff: number): string {
	if (diff === 0) return "-";
	return diff > 0 ? `+${diff}` : `${diff}`;
}

/**
 * Renders a {@link ComparisonReport} as a human-readable text report.
 * Also echoes each line to the console.
 */
function renderAsText(report: ComparisonReport): string {
	const lines: string[] = [];
	const emit = (line = ""): void => {
		console.log(line);
		lines.push(line);
	};

	emit();
	emit(`=== Bundle Size Comparison: ${report.baseLabel} -> ${report.currentLabel} ===`);
	emit();
	emit("All assets (parsed size in bytes):");
	emit(
		"Asset".padEnd(40) +
			"Base".padStart(12) +
			"Current".padStart(12) +
			"Diff".padStart(12) +
			"% Change".padStart(10),
	);
	emit("-".repeat(88));
	for (const row of report.assets) {
		const percentChange =
			row.baseParsedSize > 0 && row.diff !== 0
				? `${((row.diff / row.baseParsedSize) * 100).toFixed(1)}%`
				: "";
		emit(
			(row.name + (row.diff === 0 ? "" : " *")).padEnd(40) +
				String(row.baseParsedSize).padStart(12) +
				String(row.currentParsedSize).padStart(12) +
				formatDiff(row.diff).padStart(12) +
				percentChange.padStart(10),
		);
	}

	if (report.gzipChangedAssets.length > 0) {
		emit();
		emit("=== Gzip sizes for changed assets ===");
		emit(
			"Asset".padEnd(40) +
				"Base Gzip".padStart(14) +
				"Current Gzip".padStart(14) +
				"Diff".padStart(12),
		);
		emit("-".repeat(82));
		for (const row of report.gzipChangedAssets) {
			emit(
				row.name.padEnd(40) +
					String(row.baseGzipSize).padStart(14) +
					String(row.currentGzipSize).padStart(14) +
					formatDiff(row.diff).padStart(12),
			);
		}
	}

	emit();
	// Every row in this table is a REAL webpack entrypoint (a real shipped
	// bundle, shared modules deduped within it), unlike the synthetic composition
	// buckets below. Rows overlap and must not be summed; the `fluidFrameworkAll`
	// aggregate entrypoint gives the single deduplicated bundle-wide total.
	emit("=== Named entrypoint total asset sizes (each row is a real entrypoint) ===");
	emit(
		"Entrypoint".padEnd(30) +
			"Base".padStart(12) +
			"Current".padStart(12) +
			"Diff".padStart(12),
	);
	emit("-".repeat(68));
	for (const row of report.entrypoints) {
		emit(
			row.entrypointName.padEnd(30) +
				String(row.baseSize).padStart(12) +
				String(row.currentSize).padStart(12) +
				formatDiff(row.diff).padStart(12),
		);
	}

	const emitPackageRows = (rows: PackageSizeRow[], nameWidth: number): void => {
		emit(
			"Package".padEnd(nameWidth) +
				"Base".padStart(12) +
				"Current".padStart(12) +
				"Diff".padStart(12) +
				"% Change".padStart(10),
		);
		emit("-".repeat(nameWidth + 46));
		for (const row of rows) {
			const percentChange =
				row.baseSize > 0 && row.diff !== 0
					? `${((row.diff / row.baseSize) * 100).toFixed(1)}%`
					: "";
			emit(
				row.name.padEnd(nameWidth) +
					String(row.baseSize).padStart(12) +
					String(row.currentSize).padStart(12) +
					formatDiff(row.diff).padStart(12) +
					percentChange.padStart(10),
			);
		}
	};

	emit();
	emit("=== Bundle composition by category (parsed size in bytes) ===");
	emitPackageRows(report.packageBuckets, 40);

	emit();
	emit("=== Per-package parsed-size comparison ===");
	emitPackageRows(report.packages, 40);

	return `${lines.join("\n")}\n`;
}

/**
 * Writes the text and JSON report files. File names are derived from sanitized
 * branch names (e.g. "compare-main-to-client_v2.100.0.txt" and ".json").
 */
function writeOutputFiles(
	outputDirectory: string,
	report: ComparisonReport,
	textContent: string,
): void {
	mkdirSync(outputDirectory, { recursive: true });

	const baseSuffix = sanitizeForFileName(report.baseLabel);
	const currentSuffix = sanitizeForFileName(report.currentLabel);
	const outputBaseName = `compare-${baseSuffix}-to-${currentSuffix}`;
	const textOutputPath = resolve(outputDirectory, `${outputBaseName}.txt`);
	const jsonOutputPath = resolve(outputDirectory, `${outputBaseName}.json`);

	writeFileSync(textOutputPath, textContent);
	writeFileSync(jsonOutputPath, `${JSON.stringify(report, undefined, 2)}\n`);

	console.log("\nWrote comparison outputs:");
	console.log(`  ${textOutputPath}`);
	console.log(`  ${jsonOutputPath}`);
}

/**
 * Compares the two bundles previously collected into
 * `{analysisDirectory}/{baseLabel}/analyzer.json` and
 * `{analysisDirectory}/{currentLabel}/analyzer.json`, then writes human-readable
 * `.txt` and structured `.json` comparison reports to `outputDirectory`.
 */
export function compareBundles(options: CompareBundlesOptions): void {
	const report = computeComparison(options);
	const textContent = renderAsText(report);
	writeOutputFiles(options.outputDirectory, report, textContent);
}
