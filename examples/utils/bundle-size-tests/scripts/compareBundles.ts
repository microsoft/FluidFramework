/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { decompressStatsFile } from "@fluidframework/bundle-size-tools";
import { Command, Flags } from "@oclif/core";

import { maybePrintHelp } from "./oclifHelp.js";

// Default to the persistent analysis root used by collectBundle.ts.
// Lives under this package's `bundleAnalysis/` directory (gitignored).
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultAnalysisDirectory = resolve(scriptDirectory, "..", "bundleAnalysis");

// The current side is always written by collectBundle.ts in local mode. The
// default label is "current", but the orchestrator (collectAndCompareBundles.ts)
// passes a timestamped label like "current_<epoch>" via --current-label so that
// successive runs with different uncommitted changes don't overwrite each other.
const defaultBaseLabel = "main";
const defaultCurrentLabel = "current";

interface AssetStat {
	name: string;
	size?: number;
}

interface BundleStats {
	assets?: AssetStat[];
	entrypoints?: Record<string, { assets?: { size?: number }[] }>;
}

interface Options {
	analysisDirectory: string;
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
 * Loads and deserializes bundle statistics from a MessagePack-compressed file.
 * If the file does not exist, returns an empty stats object and logs a warning.
 */
function loadStats(analysisDirectory: string, label: string): BundleStats {
	const statsFilePath = resolve(analysisDirectory, label, "bundleStats.msp.gz");
	if (!existsSync(statsFilePath)) {
		console.warn(
			`Warning: Bundle stats not found at "${statsFilePath}". ` +
				`Returning empty stats (all assets will be treated as size 0).`,
		);
		return { assets: [], entrypoints: {} };
	}

	const compressedData = readFileSync(statsFilePath);
	const fullStats = decompressStatsFile(compressedData);
	// Project to just the fields we need so the huge `chunks`/`modules` trees
	// produced by msgpack-lite can be GC'd. Two full webpack stats objects in
	// memory at once is enough to OOM Node's default 4 GB heap.
	return {
		assets: fullStats.assets?.map((a) => ({ name: a.name, size: a.size })),
		entrypoints: fullStats.entrypoints
			? Object.fromEntries(
					Object.entries(fullStats.entrypoints).map(([name, ep]) => [
						name,
						{ assets: ep.assets?.map((a) => ({ size: a.size })) },
					]),
				)
			: {},
	};
}

function gzipSize(filePath: string): number | undefined {
	try {
		return gzipSync(readFileSync(filePath), { level: 9 }).length;
	} catch {
		return undefined;
	}
}

/**
 * Computes a structured comparison between the base and current bundle stats.
 * Pure data: does no rendering or file I/O beyond reading the stats and
 * gzip-sizing changed assets from the corresponding `build/` directories.
 */
function computeComparison(options: Options): ComparisonReport {
	const { baseLabel, currentLabel, analysisDirectory } = options;
	const baseBuildDirectory = resolve(analysisDirectory, baseLabel, "build");
	const currentBuildDirectory = resolve(analysisDirectory, currentLabel, "build");

	const baseStats = loadStats(analysisDirectory, baseLabel);
	const currentStats = loadStats(analysisDirectory, currentLabel);

	const baseAssets = Object.fromEntries(
		(baseStats.assets ?? [])
			.filter((asset) => asset.name.endsWith(".js") && !asset.name.endsWith(".map"))
			.map((asset) => [asset.name, asset]),
	);
	const currentAssets = Object.fromEntries(
		(currentStats.assets ?? [])
			.filter((asset) => asset.name.endsWith(".js") && !asset.name.endsWith(".map"))
			.map((asset) => [asset.name, asset]),
	);

	const assets: AssetComparison[] = [
		...new Set([...Object.keys(baseAssets), ...Object.keys(currentAssets)]),
	]
		.sort()
		.map((name) => {
			const baseStatSize = baseAssets[name]?.size ?? 0;
			const currentStatSize = currentAssets[name]?.size ?? 0;
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
			const baseGzipSize = gzipSize(resolve(baseBuildDirectory, row.name)) ?? 0;
			const currentGzipSize = gzipSize(resolve(currentBuildDirectory, row.name)) ?? 0;
			return {
				name: row.name,
				baseGzipSize,
				currentGzipSize,
				diff: currentGzipSize - baseGzipSize,
			};
		});

	const baseEntrypoints = baseStats.entrypoints ?? {};
	const currentEntrypoints = currentStats.entrypoints ?? {};
	const entrypoints: EntrypointRow[] = [
		...new Set([...Object.keys(baseEntrypoints), ...Object.keys(currentEntrypoints)]),
	]
		.filter((entrypointName) => !/^\d/.test(entrypointName))
		.sort()
		.map((entrypointName) => {
			const baseSize = (baseEntrypoints[entrypointName]?.assets ?? []).reduce(
				(sum, asset) => sum + (asset?.size ?? 0),
				0,
			);
			const currentSize = (currentEntrypoints[entrypointName]?.assets ?? []).reduce(
				(sum, asset) => sum + (asset?.size ?? 0),
				0,
			);
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
	writeOutputFiles(options.analysisDirectory, report, textContent);
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
			baseLabel: flags["base-label"],
			currentLabel: flags["current-label"],
		});
	}
}

if (!maybePrintHelp(process.argv.slice(2), "compareBundles.ts", CompareBundlesCommand)) {
	await CompareBundlesCommand.run(process.argv.slice(2), import.meta.url);
}
