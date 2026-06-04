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
	baseStatSize: number;
	currentStatSize: number;
	diff: number;
}

interface GzipRow {
	name: string;
	baseGzipSize: number;
	currentGzipSize: number;
	diff: number;
}

interface EntrypointRow {
	entrypointName: string;
	baseSize: number;
	currentSize: number;
	diff: number;
}

/**
 * Per-package parsed-size comparison row. `name` is the owning npm package of
 * the contributing modules (e.g. `@fluidframework/tree`, `@sinclair/typebox`),
 * or a synthetic bucket label (e.g. `other @fluidframework/*`).
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
	/** Per-entrypoint total parsed-size comparison rows */
	entrypoints: EntrypointRow[];
	/**
	 * Three-row headline split of the whole bundle's parsed bytes:
	 * `@fluidframework/tree`, `other @fluidframework/* + @fluid-*`, and
	 * `third-party`. Answers "how much of the bundle is tree" at a glance.
	 */
	packageBuckets: PackageSizeRow[];
	/**
	 * Full per-package parsed-size breakdown (one row per owning package),
	 * sorted by current size descending. Sizes are deduplicated by module so a
	 * module shared across entrypoints is counted once.
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
 */
function packageFromModulePath(modulePath: string): string {
	const normalized = modulePath.replace(/\\/g, "/");
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
 * to a single key. Anchoring at `node_modules/` or `packages/` strips that
 * per-entry prefix, giving "unique module" dedup semantics.
 */
function canonicalModuleKey(modulePath: string): string {
	const normalized = modulePath.replace(/\\/g, "/");
	const nodeModulesIndex = normalized.lastIndexOf("node_modules/");
	if (nodeModulesIndex >= 0) return normalized.slice(nodeModulesIndex);
	const packagesIndex = normalized.indexOf("packages/");
	if (packagesIndex >= 0) return normalized.slice(packagesIndex);
	return normalized;
}

/**
 * Walks each asset's `groups` module tree and sums parsed sizes per owning
 * package. Modules are deduplicated by {@link canonicalModuleKey}, so a module
 * shared across multiple entrypoints is counted exactly once (whole-bundle
 * "unique module size" semantics).
 */
function packageSizes(nodes: AnalyzerNode[]): Map<string, number> {
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

	for (const node of nodes.filter(isJsAsset)) {
		visit(node);
	}
	return perPackage;
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

/**
 * Collapses per-package rows into the three headline buckets:
 * `@fluidframework/tree`, `other @fluidframework/* + @fluid-*`, and `third-party`.
 */
function bucketPackageSizes(rows: PackageSizeRow[]): PackageSizeRow[] {
	const buckets: Record<string, PackageSizeRow> = {
		tree: { name: "@fluidframework/tree", baseSize: 0, currentSize: 0, diff: 0 },
		otherFluid: {
			name: "other @fluidframework/* + @fluid-*",
			baseSize: 0,
			currentSize: 0,
			diff: 0,
		},
		thirdParty: { name: "third-party", baseSize: 0, currentSize: 0, diff: 0 },
	};
	for (const row of rows) {
		const bucket =
			row.name === "@fluidframework/tree"
				? buckets.tree
				: row.name.startsWith("@fluidframework/") || row.name.startsWith("@fluid-")
					? buckets.otherFluid
					: buckets.thirdParty;
		bucket.baseSize += row.baseSize;
		bucket.currentSize += row.currentSize;
		bucket.diff += row.diff;
	}
	return [buckets.tree, buckets.otherFluid, buckets.thirdParty];
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
			const baseStatSize = base?.parsedSize ?? 0;
			const currentStatSize = compare?.parsedSize ?? 0;
			return {
				name,
				baseStatSize,
				currentStatSize,
				diff: currentStatSize - baseStatSize,
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

	// Per-package parsed-size breakdown. Walks each side's module tree (the
	// `groups` already parsed into `*Nodes`), dedupes modules, and diffs the
	// resulting per-package maps — then rolls those rows up into the three
	// headline buckets.
	const packages = diffPackageSizes(packageSizes(baseNodes), packageSizes(currentNodes));
	const packageBuckets = bucketPackageSizes(packages);

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
	emit("All assets (stat/parsed size in bytes):");
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
			row.baseStatSize > 0 && row.diff !== 0
				? `${((row.diff / row.baseStatSize) * 100).toFixed(1)}%`
				: "";
		emit(
			(row.name + (row.diff === 0 ? "" : " *")).padEnd(40) +
				String(row.baseStatSize).padStart(12) +
				String(row.currentStatSize).padStart(12) +
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
	emit("=== Named entrypoint total asset sizes ===");
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
