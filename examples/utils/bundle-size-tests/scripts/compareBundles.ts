/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command, Flags } from "@oclif/core";

import { maybePrintHelp } from "./oclifHelp.js";

// Default to the persistent analysis root used by collectBundle.ts.
// Lives under this package's `bundleAnalysis/` directory (gitignored).
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultAnalysisDirectory = resolve(scriptDirectory, "..", "bundleAnalysis");

// Comparison reports are written here, separate from the (large, gitignored)
// bundleAnalysis stats so the human-readable outputs are easy to find and keep.
const defaultOutputDirectory = resolve(scriptDirectory, "..", "compareBundlesOutput");

// The current side is always written by collectBundle.ts in local mode. The
// default label is "current", but the orchestrator (collectAndCompareBundles.ts)
// passes a timestamped label like "current_<epoch>" via --current-label so that
// successive runs with different uncommitted changes don't overwrite each other.
const defaultBaseLabel = "main";
const defaultCurrentLabel = "current";

/**
 * A node from webpack-bundle-analyzer's JSON report (`analyzerMode: "json"`).
 * Only the fields this script consumes are modeled. Each top-level node is an
 * emitted asset; `parsedSize`/`gzipSize` are the minified and gzipped sizes of
 * the asset as it ships, and `isInitialByEntrypoint` maps each entrypoint the
 * asset is an initial chunk of to `true`.
 */
interface AnalyzerNode {
	label: string;
	isAsset?: boolean;
	parsedSize?: number;
	gzipSize?: number;
	isInitialByEntrypoint?: Record<string, boolean>;
}

interface Options {
	analysisDirectory: string;
	outputDirectory: string;
	baseLabel: string;
	currentLabel: string;
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
}

function sanitizeForFileName(value: string): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all
	return value.replace(/[^\w.-]/g, "_");
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

/** Whether an analyzer node is an emitted `.js` asset (excluding source maps). */
function isJsAsset(node: AnalyzerNode): boolean {
	return node.label.endsWith(".js") && !node.label.endsWith(".map");
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
 * Computes a structured comparison between the base and current bundles.
 * Pure data: reads each side's `analyzer.json` (webpack-bundle-analyzer's JSON
 * report) and does no other I/O. Parsed and gzip sizes come straight from that
 * report, so no webpack stats decompression or on-disk gzipping is needed.
 */
function computeComparison(options: Options): ComparisonReport {
	const { baseLabel, currentLabel, analysisDirectory } = options;

	const baseNodes = loadAnalyzer(analysisDirectory, baseLabel);
	const currentNodes = loadAnalyzer(analysisDirectory, currentLabel);

	const baseAssets = Object.fromEntries(
		baseNodes.filter(isJsAsset).map((node) => [node.label, node]),
	);
	const currentAssets = Object.fromEntries(
		currentNodes.filter(isJsAsset).map((node) => [node.label, node]),
	);

	const assets: AssetComparison[] = [
		...new Set([...Object.keys(baseAssets), ...Object.keys(currentAssets)]),
	]
		.sort()
		.map((name) => {
			const baseStatSize = baseAssets[name]?.parsedSize ?? 0;
			const currentStatSize = currentAssets[name]?.parsedSize ?? 0;
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
			const baseGzipSize = baseAssets[row.name]?.gzipSize ?? 0;
			const currentGzipSize = currentAssets[row.name]?.gzipSize ?? 0;
			return {
				name: row.name,
				baseGzipSize,
				currentGzipSize,
				diff: currentGzipSize - baseGzipSize,
			};
		});

	// Sum each entrypoint's initial-chunk parsed sizes.
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

	return {
		comparedAt: new Date().toISOString(),
		baseLabel,
		currentLabel,
		analysisDirectory,
		assets,
		gzipChangedAssets,
		entrypoints,
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

function runCompare(options: Options): void {
	const report = computeComparison(options);
	const textContent = renderAsText(report);
	writeOutputFiles(options.outputDirectory, report, textContent);
}

class CompareBundlesCommand extends Command {
	public static override readonly description =
		"Compare the two bundles previously collected by collectBundle.ts " +
		"(base = --base-label, current = --current-label).";

	public static override readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --base-label some-revision",
		"<%= config.bin %> <%= command.id %> --analysis-dir /some/other/path",
	];

	public static override readonly flags = {
		"analysis-dir": Flags.string({
			description:
				"Parent directory containing bundleStats.msp.gz files at " +
				"{label}/bundleStats.msp.gz.",
			default: defaultAnalysisDirectory,
		}),
		"output-dir": Flags.string({
			description:
				"Directory where the .txt and .json comparison reports are written.",
			default: defaultOutputDirectory,
		}),
		"base-label": Flags.string({
			description:
				"Label subdirectory under --analysis-dir holding the base-side " +
				"bundle stats. Must match the --label passed to collectBundle.ts " +
				"in revision mode.",
			default: defaultBaseLabel,
		}),
		"current-label": Flags.string({
			description:
				"Label subdirectory under --analysis-dir holding the current-side " +
				"bundle stats. Must match the --label passed to collectBundle.ts " +
				"in local mode (the orchestrator passes a timestamped label like " +
				"'current_<epoch>').",
			default: defaultCurrentLabel,
		}),
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(CompareBundlesCommand);
		runCompare({
			analysisDirectory: resolve(flags["analysis-dir"]),
			outputDirectory: resolve(flags["output-dir"]),
			baseLabel: flags["base-label"],
			currentLabel: flags["current-label"],
		});
	}
}

if (!maybePrintHelp(process.argv.slice(2), "compareBundles.ts", CompareBundlesCommand)) {
	await CompareBundlesCommand.run(process.argv.slice(2), import.meta.url);
}
