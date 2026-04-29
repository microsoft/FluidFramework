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

import { maybePrintHelp } from "./oclifHelp.ts";

// Default to the persistent analysis root used by collectBundle.ts.
// Lives under this package's `bundleAnalysis/` directory (gitignored).
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultAnalysisDirectory = resolve(scriptDirectory, "..", "bundleAnalysis");

// The current side is always written by collectBundle.ts in local mode, which
// uses the fixed label "current". The base side is whatever label
// collectBundle.ts wrote in revision mode (default "main", overridable via
// --base-label).
const defaultBaseLabel = "main";
const currentLabel = "current";

/**
 * Sanitizes a string for use as a filename by replacing non-alphanumeric characters with underscores.
 *
 * @param value - The string to sanitize
 * @returns The sanitized string safe for use as a filename
 */
function sanitizeForFileName(value: string): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all
	return value.replace(/[^\w.-]/g, "_");
}

/** Represents a single asset in a bundle. */
interface AssetStat {
	/** The name of the asset (e.g., "bundle.js") */
	name: string;
	/** The parsed size of the asset in bytes */
	size?: number;
}

/** Represents aggregated statistics for a bundle build. */
interface BundleStats {
	/** Array of assets and their sizes */
	assets?: AssetStat[];
	/** Entrypoint names mapped to their constituent assets and sizes */
	entrypoints?: Record<string, { assets?: { size?: number }[] }>;
}

/**
 * Loads and deserializes bundle statistics from a MessagePack-compressed file.
 * If the file does not exist, returns an empty stats object and logs a warning.
 *
 * @param analysisDirectory - The base analysis directory
 * @param label - The label subdirectory (typically derived from branch name)
 * @returns Parsed bundle statistics, or empty stats if file not found
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
	const slim: BundleStats = {
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
	return slim;
}

/**
 * Calculates the gzip-compressed size of a file using maximum compression level.
 *
 * @param filePath - The path to the file
 * @returns The gzip-compressed size in bytes, or undefined if the file cannot be read
 */
function gzipSize(filePath: string): number | undefined {
	try {
		return gzipSync(readFileSync(filePath), { level: 9 }).length;
	} catch {
		return undefined;
	}
}

/**
 * Provides dual console and text file output for bundle comparison reports.
 */
class Reporter {
	private readonly outputLines: string[] = [];

	/**
	 * Prints a line to both console and internal buffer.
	 *
	 * @param line - The line to print (defaults to empty string)
	 */
	print(line = ""): void {
		console.log(line);
		this.outputLines.push(line);
	}

	/**
	 * Prints a section header with spacing.
	 *
	 * @param title - The section title
	 */
	section(title: string): void {
		this.print();
		this.print(title);
	}

	/**
	 * Prints a table header with a divider line.
	 *
	 * @param header - The header text
	 * @param dividerLength - The length of the divider line
	 */
	tableHeader(header: string, dividerLength: number): void {
		this.print(header);
		this.print("-".repeat(dividerLength));
	}

	/**
	 * Returns all accumulated output as a single text string.
	 *
	 * @returns The full text output
	 */
	toText(): string {
		return `${this.outputLines.join("\n")}\n`;
	}
}

/** Represents a comparison row for a single asset between two builds. */
interface CompareRow {
	/** The asset name */
	name: string;
	/** The parsed size in the base build */
	baseStatSize: number;
	/** The parsed size in the current build */
	currentStatSize: number;
}

/**
 * Formats an asset comparison row for tabular display.
 * Includes name, base size, current size, diff, and percentage change.
 *
 * @param row - The comparison row to format
 * @returns A formatted string suitable for console output
 */
function formatAssetRow(row: CompareRow): string {
	const diff = row.currentStatSize - row.baseStatSize;
	const percentChange =
		row.baseStatSize > 0 && diff !== 0
			? `${((diff / row.baseStatSize) * 100).toFixed(1)}%`
			: "";
	const diffStr = diff === 0 ? "-" : `${diff > 0 ? "+" : ""}${diff}`;

	return (
		(row.name + (diff === 0 ? "" : " *")).padEnd(40) +
		String(row.baseStatSize).padStart(12) +
		String(row.currentStatSize).padStart(12) +
		diffStr.padStart(12) +
		percentChange.padStart(10)
	);
}

/**
 * Formats an entrypoint comparison row for tabular display.
 * Includes entrypoint name, base size, current size, and diff.
 *
 * @param entrypointName - The name of the entrypoint
 * @param baseSize - The total parsed size of assets in the base entrypoint
 * @param currentSize - The total parsed size of assets in the current entrypoint
 * @returns A formatted string suitable for console output
 */
function formatEntrypointRow(
	entrypointName: string,
	baseSize: number,
	currentSize: number,
): string {
	const diff = currentSize - baseSize;
	const diffStr = diff === 0 ? "-" : `${diff > 0 ? "+" : ""}${diff}`;
	return (
		entrypointName.padEnd(30) +
		String(baseSize).padStart(12) +
		String(currentSize).padStart(12) +
		diffStr.padStart(12)
	);
}

/** Parsed command-line options for the bundle comparison script. */
interface Options {
	/** Directory containing per-label bundleStats.msp.gz files at \{label\}/bundleStats.msp.gz (default: this package's bundleAnalysis/) */
	analysisDirectory: string;
	/** Label subdirectory holding the base-side bundle stats (default: "main"). */
	baseLabel: string;
}

/**
 * Writes comparison results to both text and JSON output files.
 * Creates the output directory if it does not exist.
 * File names are derived from sanitized branch names (e.g., "compare-main-to-dev.txt").
 *
 * @param outputDirectory - The directory where output files will be written
 * @param textContent - The formatted text comparison report
 * @param jsonObject - The structured comparison data as a JSON-serializable object
 */
function writeOutputFiles(
	outputDirectory: string,
	baseLabel: string,
	textContent: string,
	jsonObject: object,
): void {
	mkdirSync(outputDirectory, { recursive: true });

	const baseSuffix = sanitizeForFileName(baseLabel);
	const currentSuffix = sanitizeForFileName(currentLabel);
	const outputBaseName = `compare-${baseSuffix}-to-${currentSuffix}`;
	const textOutputPath = resolve(outputDirectory, `${outputBaseName}.txt`);
	const jsonOutputPath = resolve(outputDirectory, `${outputBaseName}.json`);

	writeFileSync(textOutputPath, textContent);
	writeFileSync(jsonOutputPath, `${JSON.stringify(jsonObject, undefined, 2)}\n`);

	console.log("\nWrote comparison outputs:");
	console.log(`  ${textOutputPath}`);
	console.log(`  ${jsonOutputPath}`);
}

/**
 * Prints the help text describing usage, options, and examples for the script.
 */

/** Represents gzip size comparison data for a single asset. */
interface GzipRow {
	/** The asset name */
	name: string;
	/** Gzip-compressed size of the asset in the base build (if available) */
	baseGzipSize?: number;
	/** Gzip-compressed size of the asset in the current build (if available) */
	currentGzipSize?: number;
	/** Difference in gzip size (current - base) */
	diff?: number;
}

/** Represents entrypoint comparison data from parsed bundle statistics. */
interface EntrypointRow {
	/** The entrypoint name */
	entrypointName: string;
	/** Total parsed size of assets in the base entrypoint */
	baseSize: number;
	/** Total parsed size of assets in the current entrypoint */
	currentSize: number;
	/** Difference in total size (current - base) */
	diff: number;
}

/**
 * Loads statistics from base and current builds, compares assets and entrypoints,
 * and generates both console and file-based reports (text and JSON).
 */
class CompareBundlesCommand extends Command {
	public static override readonly description =
		`Compare the two bundles previously collected by collectBundle.ts (base = --base-label, current = ${currentLabel}).`;

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
	};

	public async run(): Promise<void> {
		const { flags } = await this.parse(CompareBundlesCommand);
		const options: Options = {
			analysisDirectory: resolve(flags["analysis-dir"]),
			baseLabel: flags["base-label"],
		};

		runCompare(options);
	}
}

/**
 * Runs the bundle comparison and writes the report files.
 *
 * @param options - Parsed options for the comparison
 */
function runCompare(options: Options): void {
	const reporter = new Reporter();

	const { baseLabel } = options;
	const outputDirectory = options.analysisDirectory;
	const baseBuildDirectory = resolve(outputDirectory, baseLabel, "build");
	const currentBuildDirectory = resolve(outputDirectory, currentLabel, "build");

	const baseStats = loadStats(outputDirectory, baseLabel);
	const currentStats = loadStats(outputDirectory, currentLabel);

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

	const rows: CompareRow[] = [
		...new Set([...Object.keys(baseAssets), ...Object.keys(currentAssets)]),
	]
		.sort()
		.map((name) => ({
			name,
			baseStatSize: baseAssets[name]?.size ?? 0,
			currentStatSize: currentAssets[name]?.size ?? 0,
		}));

	reporter.section(`=== Bundle Size Comparison: ${baseLabel} -> ${currentLabel} ===`);
	reporter.section("All assets (stat/parsed size in bytes):");
	reporter.tableHeader(
		"Asset".padEnd(40) +
			"Base".padStart(12) +
			"Current".padStart(12) +
			"Diff".padStart(12) +
			"% Change".padStart(10),
		88,
	);
	for (const row of rows) {
		reporter.print(formatAssetRow(row));
	}

	const changedRows = rows.filter((row) => row.currentStatSize !== row.baseStatSize);
	const gzipRows: GzipRow[] = [];
	if (changedRows.length > 0) {
		reporter.section("=== Gzip sizes for changed assets ===");
		reporter.tableHeader(
			"Asset".padEnd(40) +
				"Base Gzip".padStart(14) +
				"Current Gzip".padStart(14) +
				"Diff".padStart(12),
			82,
		);

		for (const row of changedRows) {
			// Missing assets are treated as size 0: an asset present in only one revision
			// (e.g. webpack auto-generated vendor chunks whose hash-based names change)
			// represents a genuine delta, not missing data.
			const baseGzipSize = gzipSize(resolve(baseBuildDirectory, row.name)) ?? 0;
			const currentGzipSize = gzipSize(resolve(currentBuildDirectory, row.name)) ?? 0;
			const diff = currentGzipSize - baseGzipSize;
			const line =
				row.name.padEnd(40) +
				String(baseGzipSize).padStart(14) +
				String(currentGzipSize).padStart(14) +
				`${diff > 0 ? "+" : ""}${diff}`.padStart(12);
			reporter.print(line);
			gzipRows.push({ name: row.name, baseGzipSize, currentGzipSize, diff });
		}
	}

	const baseEntrypoints = baseStats.entrypoints ?? {};
	const currentEntrypoints = currentStats.entrypoints ?? {};
	const entrypointRows: EntrypointRow[] = [];
	const namedEntrypoints = [
		...new Set([...Object.keys(baseEntrypoints), ...Object.keys(currentEntrypoints)]),
	]
		.filter((entrypointName) => !/^\d/.test(entrypointName))
		.sort();

	reporter.section("=== Named entrypoint total asset sizes ===");
	reporter.tableHeader(
		"Entrypoint".padEnd(30) +
			"Base".padStart(12) +
			"Current".padStart(12) +
			"Diff".padStart(12),
		68,
	);
	for (const entrypointName of namedEntrypoints) {
		const baseSize = (baseEntrypoints[entrypointName]?.assets ?? []).reduce(
			(sum, asset) => sum + (asset?.size ?? 0),
			0,
		);
		const currentSize = (currentEntrypoints[entrypointName]?.assets ?? []).reduce(
			(sum, asset) => sum + (asset?.size ?? 0),
			0,
		);
		reporter.print(formatEntrypointRow(entrypointName, baseSize, currentSize));
		entrypointRows.push({
			entrypointName,
			baseSize,
			currentSize,
			diff: currentSize - baseSize,
		});
	}

	writeOutputFiles(outputDirectory, baseLabel, reporter.toText(), {
		comparedAt: new Date().toISOString(),
		baseLabel,
		currentLabel,
		analysisDirectory: options.analysisDirectory,
		assets: rows.map((row) => ({
			name: row.name,
			baseStatSize: row.baseStatSize,
			currentStatSize: row.currentStatSize,
			diff: row.currentStatSize - row.baseStatSize,
		})),
		gzipChangedAssets: gzipRows,
		entrypoints: entrypointRows,
	});
}

if (!maybePrintHelp(process.argv.slice(2), "compareBundles.ts", CompareBundlesCommand)) {
	await CompareBundlesCommand.run(process.argv.slice(2), import.meta.url);
}
