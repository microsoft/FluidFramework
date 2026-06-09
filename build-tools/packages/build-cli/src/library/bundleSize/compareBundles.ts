/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { compareJsonReports } from "./compareJsonReports.js";
import type { BundlesComparison } from "./types.js";

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

/**
 * One comparison row: a named measurement — an asset, entrypoint, owning
 * package, or synthetic composition bucket — sized on both the base and current
 * side, with `diff = current - base`. Every output set in the report is a list
 * of these, so they share one factory ({@link makeRow}) and one renderer
 * ({@link renderTable}). The unit of `base`/`current` depends on which list the
 * row lives in: parsed bytes for most, gzip bytes for `gzipChangedAssets`.
 */
interface ComparisonRow {
	name: string;
	base: number;
	current: number;
	diff: number;
}

/** Builds a {@link ComparisonRow}, deriving `diff` from the two sides. */
function makeRow(name: string, base: number, current: number): ComparisonRow {
	return { name, base, current, diff: current - base };
}

/** Structured comparison report written to the JSON output file. */
interface ComparisonReport {
	/** ISO timestamp of when the comparison was generated. */
	comparedAt: string;
	/** Label subdirectory holding the base-side bundle stats. */
	baseLabel: string;
	/** Label subdirectory holding the current-side bundle stats. */
	currentLabel: string;
	/** Parent directory containing the per-label bundle stats. */
	analysisDirectory: string;
	/** Parsed-size rows for every emitted JS asset (changed or not). */
	assets: ComparisonRow[];
	/** Gzip-size rows, limited to assets whose gzip size changed. */
	gzipChangedAssets: ComparisonRow[];
	/**
	 * Per-entrypoint total parsed-size rows. Each row is a real shipped bundle;
	 * see {@link compareEntrypointTotals}. Rows overlap and must not be summed —
	 * the aggregate `fluidFrameworkAll` entrypoint is the single deduplicated
	 * bundle-wide total.
	 */
	entrypoints: ComparisonRow[];
	/**
	 * Headline composition buckets, each pinned to a real entrypoint (never
	 * summed across entrypoints); see {@link bucketDefinitions}.
	 */
	packageBuckets: ComparisonRow[];
	/**
	 * Full per-package breakdown (one row per owning package, sorted by current
	 * size descending), scoped to the `fluidFrameworkAll` aggregate entrypoint and
	 * deduplicated by module.
	 */
	packages: ComparisonRow[];
}

// --- Loading analyzer reports & asset helpers ---

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

// --- Module -> owning-package attribution ---

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
 * Locates the path segment that identifies a module's owning package: the
 * *last* `node_modules/` (so a package's own nested dependencies are attributed
 * to themselves), or failing that the *first* `packages/` (the workspace source
 * layout). Returns the matched marker and its index, or `undefined` for paths
 * belonging to neither (e.g. the synthetic entrypoint's own modules). Both
 * {@link packageFromModulePath} and {@link canonicalModuleKey} anchor here.
 */
function moduleAnchor(
	modulePath: string,
): { marker: "node_modules/" | "packages/"; index: number } | undefined {
	const nodeModulesIndex = modulePath.lastIndexOf("node_modules/");
	if (nodeModulesIndex >= 0) return { marker: "node_modules/", index: nodeModulesIndex };
	const packagesIndex = modulePath.indexOf("packages/");
	if (packagesIndex >= 0) return { marker: "packages/", index: packagesIndex };
	return undefined;
}

/**
 * Extracts the owning npm package name from a webpack-bundle-analyzer module
 * `path`. Handles the three shapes that appear in this repo's bundles:
 *
 * - **Third-party (pnpm):** `.../node_modules/.pnpm/<key>/node_modules/<pkg>/...` —
 * the name after the *last* `node_modules/` is used, so a package's own nested
 * dependencies are attributed to themselves. Scoped packages keep their `@scope/name`.
 * - **Workspace packages:** `.../packages/<group>/<name>/...` — these are the
 * Fluid Framework source packages, published as `@fluidframework/<name>`.
 * - **App/entry code:** anything else (e.g. the bundle-size-tests synthetic
 * entrypoint's own `./src/*.ts` modules) is grouped under `(app/entry)`.
 *
 * Concatenated-module wrapper prefixes are stripped first (see
 * {@link stripConcatenationWrapper}) so scope-hoisted modules are attributed to
 * their true owning package rather than the concatenating barrel.
 */
function packageFromModulePath(modulePath: string): string {
	const normalized = stripConcatenationWrapper(modulePath);
	const anchor = moduleAnchor(normalized);
	if (anchor === undefined) return "(app/entry)";
	const parts = normalized.slice(anchor.index + anchor.marker.length).split("/");
	if (anchor.marker === "node_modules/") {
		return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
	}
	// Workspace layout: packages/<group>/<name>/lib/...
	return parts.length >= 2 ? `@fluidframework/${parts[1]}` : "(app/entry)";
}

/**
 * Produces a stable identity for a module so the same source module reached via
 * different entrypoints (webpack prefixes the path with the concatenating
 * entry, e.g. `./src/sharedTree.ts + 384 modules (concatenated)/...`) collapses
 * to a single key. The concatenation wrapper prefix is stripped first (see
 * {@link stripConcatenationWrapper}), then anchoring at the owning-package
 * segment (see {@link moduleAnchor}) removes any remaining per-entry prefix,
 * giving "unique module" dedupe semantics.
 */
function canonicalModuleKey(modulePath: string): string {
	const normalized = stripConcatenationWrapper(modulePath);
	const anchor = moduleAnchor(normalized);
	return anchor === undefined ? normalized : normalized.slice(anchor.index);
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
		// A node with children is an aggregate (asset, directory, or concatenated
		// wrapper) whose parsedSize is just the sum of its descendants. Recurse into
		// the children and skip the parent so those bytes are not double-counted;
		// only childless leaf modules carry a real path and standalone size.
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

// --- Composition buckets ---

/** Named entrypoint assets the buckets and per-package breakdown are measured from. */
const entrypointAssets = {
	/** Entrypoint asset for the full deduplicated Fluid Framework footprint (`bundle-size-tests/src/fluidFrameworkAll.ts`). */
	fluidFrameworkAll: "fluidFrameworkAll.js",
	/** Entrypoint asset for SharedTree's own bundle (`bundle-size-tests/src/sharedTree.ts`). */
	sharedTree: "sharedTree.js",
} as const;

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
		console.warn(
			`Warning: entrypoint asset "${assetLabel}" not found; reporting it as size 0.`,
		);
		return new Map();
	}
	return accumulatePackageSizes([asset]);
}

/** Diffs two per-package size maps into {@link ComparisonRow}s, sorted by current size descending (ties broken by name). */
function diffPackageSizes(
	base: Map<string, number>,
	current: Map<string, number>,
): ComparisonRow[] {
	// Missing on a side is treated as size 0 (added/removed package).
	return [...new Set([...base.keys(), ...current.keys()])]
		.map((name) => makeRow(name, base.get(name) ?? 0, current.get(name) ?? 0))
		.sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));
}

/** Whether a package name belongs to Fluid Framework (any `@fluidframework/*` or `@fluid-*`). */
function isFluidPackage(name: string): boolean {
	return name.startsWith("@fluidframework/") || name.startsWith("@fluid-");
}

/** Whether a package's bytes are third-party (not a Fluid library, not synthetic entrypoint code). */
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
 * per-package data has no dependency graph). Synthetic entrypoint code is always
 * excluded (see {@link isThirdPartyPackage}).
 */
const bucketDefinitions: readonly BucketDefinition[] = [
	{
		label: "SharedTree + 3rd-party deps",
		asset: entrypointAssets.sharedTree,
		withThirdParty: true,
	},
	{
		label: "SharedTree",
		asset: entrypointAssets.sharedTree,
		withThirdParty: false,
	},
	{
		label: "Fluid Framework + 3rd-party deps",
		asset: entrypointAssets.fluidFrameworkAll,
		withThirdParty: true,
	},
	{
		label: "Fluid Framework",
		asset: entrypointAssets.fluidFrameworkAll,
		withThirdParty: false,
	},
];

/**
 * Computes the per-package outputs from the raw nodes: the headline composition
 * buckets ({@link bucketDefinitions}) and the full per-package breakdown for the
 * `fluidFrameworkAll` aggregate entrypoint. Both derive from the same
 * entrypoint-scoped, diffed per-package rows, so each asset's rows are computed
 * once (memoized) and reused across every bucket that references it and the full
 * breakdown. Each bucket sums its bundle's Fluid packages (plus third-party deps
 * when asked).
 */
function comparePackages(
	baseNodes: AnalyzerNode[],
	currentNodes: AnalyzerNode[],
): { packageBuckets: ComparisonRow[]; packages: ComparisonRow[] } {
	// Per-package rows are each scoped to a single real entrypoint (not a sum
	// over entrypoints), deduping modules within that asset before diffing.
	// Memoized because each entrypoint feeds more than one headline bucket as
	// well as the full per-package breakdown.
	const rowsByAsset = new Map<string, ComparisonRow[]>();
	const rowsForAsset = (asset: string): ComparisonRow[] => {
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

	const packageBuckets = bucketDefinitions.map((def) => {
		let base = 0;
		let current = 0;
		for (const row of rowsForAsset(def.asset)) {
			if (isFluidPackage(row.name) || (def.withThirdParty && isThirdPartyPackage(row.name))) {
				base += row.base;
				current += row.current;
			}
		}
		return makeRow(def.label, base, current);
	});

	return {
		packageBuckets,
		packages: rowsForAsset(entrypointAssets.fluidFrameworkAll),
	};
}

// --- Comparison computation ---

/**
 * Per-asset rows for one size field of every emitted JS asset (source maps
 * excluded), sorted by name. Sizes come straight from the shared
 * {@link compareJsonReports} primitive; an asset present on only one side is
 * treated as size 0 on the other. Drives both the parsed-size and gzip-size
 * asset tables.
 */
function compareAssetField(
	bundleComparison: BundlesComparison,
	field: "parsedSize" | "gzipSize",
): ComparisonRow[] {
	return Object.keys(bundleComparison)
		.filter(isJsAssetName)
		.sort()
		.map((name) => {
			const { base, compare } = bundleComparison[name];
			return makeRow(name, base?.[field] ?? 0, compare?.[field] ?? 0);
		});
}

/**
 * Per-entrypoint total parsed-size rows, sorted by name. Reads the raw nodes
 * directly because the per-entrypoint totals come from `isInitialByEntrypoint`,
 * which the comparison's per-asset `BundleData` does not carry. Webpack's
 * numeric-id split chunks are filtered out so only named entrypoints remain.
 */
function compareEntrypointTotals(
	baseNodes: AnalyzerNode[],
	currentNodes: AnalyzerNode[],
): ComparisonRow[] {
	const baseEntrypoints = entrypointSizes(baseNodes);
	const currentEntrypoints = entrypointSizes(currentNodes);
	return [...new Set([...Object.keys(baseEntrypoints), ...Object.keys(currentEntrypoints)])]
		.filter((name) => !/^\d/.test(name))
		.sort()
		.map((name) => makeRow(name, baseEntrypoints[name] ?? 0, currentEntrypoints[name] ?? 0));
}

/**
 * Computes a structured comparison between the base and current bundles.
 * Pure data: reads each side's `analyzer.json` (webpack-bundle-analyzer's JSON
 * report) and does no other I/O. Parsed and gzip sizes come straight from that
 * report, so no webpack stats decompression or on-disk gzipping is needed. Each
 * output set is produced by its own focused helper:
 *
 * - {@link compareAssetField} — per-asset (parsed and gzip).
 * - {@link compareEntrypointTotals} — per real entrypoint.
 * - {@link comparePackages} — the headline buckets and full per-package
 * breakdown, sharing one memoized per-asset row computation.
 */
function computeBundleComparison(options: CompareBundlesOptions): ComparisonReport {
	const { baseLabel, currentLabel, analysisDirectory } = options;

	const baseNodes = loadAnalyzer(analysisDirectory, baseLabel);
	const currentNodes = loadAnalyzer(analysisDirectory, currentLabel);

	// Shared primitive: per-asset { base?, compare? } size data keyed by asset
	// label, restricted to JS assets (excluding source maps) by the helpers below.
	const bundleComparison = compareJsonReports(baseNodes, currentNodes);
	const assets = compareAssetField(bundleComparison, "parsedSize");

	// The gzip table reports only the assets whose gzip size actually changed.
	const gzipChangedAssets = compareAssetField(bundleComparison, "gzipSize").filter(
		(row) => row.diff !== 0,
	);

	const { packageBuckets, packages } = comparePackages(baseNodes, currentNodes);

	return {
		comparedAt: new Date().toISOString(),
		baseLabel,
		currentLabel,
		analysisDirectory,
		assets,
		gzipChangedAssets,
		entrypoints: compareEntrypointTotals(baseNodes, currentNodes),
		packageBuckets,
		packages,
	};
}

// --- Text rendering ---

/** Formats a signed diff as "-", "+N", or "-N". */
function formatDiff(diff: number): string {
	if (diff === 0) return "-";
	return diff > 0 ? `+${diff}` : `${diff}`;
}

/** Column widths shared by every comparison table. */
const nameColumnWidth = 40;
const valueColumnWidth = 12;
const percentColumnWidth = 10;

/** One rendered section: a banner heading over a {@link ComparisonRow} table. */
interface TableSpec {
	/** Banner text (rendered inside `=== ... ===`). */
	heading: string;
	/** Header for the name column (e.g. "Asset", "Entrypoint", "Package"). */
	nameHeader: string;
	/** Rows to render. */
	rows: ComparisonRow[];
	/** Append a base-relative "% Change" column. */
	showPercent?: boolean;
	/** Flag changed rows with a trailing " *". */
	markChanged?: boolean;
}

/** Renders one {@link TableSpec} (banner, header, separator, rows) via `emit`. */
function renderTable(emit: (line?: string) => void, spec: TableSpec): void {
	const { heading, nameHeader, rows, showPercent = false, markChanged = false } = spec;
	const cell = (value: string): string => value.padStart(valueColumnWidth);

	let header =
		nameHeader.padEnd(nameColumnWidth) + cell("Base") + cell("Current") + cell("Diff");
	if (showPercent) header += "% Change".padStart(percentColumnWidth);

	emit();
	emit(`=== ${heading} ===`);
	emit(header);
	emit("-".repeat(header.length));
	for (const row of rows) {
		const name = row.name + (markChanged && row.diff !== 0 ? " *" : "");
		let line =
			name.padEnd(nameColumnWidth) +
			cell(String(row.base)) +
			cell(String(row.current)) +
			cell(formatDiff(row.diff));
		if (showPercent) {
			const percent =
				row.base > 0 && row.diff !== 0 ? `${((row.diff / row.base) * 100).toFixed(1)}%` : "";
			line += percent.padStart(percentColumnWidth);
		}
		emit(line);
	}
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

	// Asset-level sections: per-emitted-file sizes, independent of entrypoints.
	renderTable(emit, {
		heading: "All assets (parsed size in bytes)",
		nameHeader: "Asset",
		rows: report.assets,
		showPercent: true,
		markChanged: true,
	});
	if (report.gzipChangedAssets.length > 0) {
		renderTable(emit, {
			heading: "Gzip sizes for changed assets",
			nameHeader: "Asset",
			rows: report.gzipChangedAssets,
		});
	}

	// Entrypoint-level section: each row is a real shipped bundle. Rows overlap
	// and must not be summed; the `fluidFrameworkAll` aggregate entrypoint gives
	// the single deduplicated bundle-wide total.
	renderTable(emit, {
		heading: "Named entrypoint total asset sizes (each row is a real entrypoint)",
		nameHeader: "Entrypoint",
		rows: report.entrypoints,
	});

	// Package-level sections: composition buckets, then the full breakdown. Both
	// are scoped to real entrypoints (see bucketDefinitions / ComparisonReport).
	renderTable(emit, {
		heading: "Bundle composition by category (parsed size in bytes)",
		nameHeader: "Package",
		rows: report.packageBuckets,
		showPercent: true,
	});
	renderTable(emit, {
		heading: "Per-package parsed-size comparison",
		nameHeader: "Package",
		rows: report.packages,
		showPercent: true,
	});

	return `${lines.join("\n")}\n`;
}

// --- File output ---

function sanitizeForFileName(value: string): string {
	return value.replaceAll(/[^\w.-]/g, "_");
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
	const report = computeBundleComparison(options);
	const textContent = renderAsText(report);
	writeOutputFiles(options.outputDirectory, report, textContent);
}
