#!/usr/bin/env npx tsx
/**
 * biome-print-config.ts - Print effective Biome lint configuration for a file
 *
 * Usage:
 *   npx tsx scripts/biome-print-config.ts [file] [--json]
 *
 * Options:
 *   file    - Optional file path to analyze
 *   --json  - Output in JSON format
 *
 * If no file is provided, prints the global configuration.
 * If a file is provided, shows which rules apply to that specific file.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface BiomeConfig {
	configPath: string;
	formatterEnabled: boolean;
	linterEnabled: boolean;
	enabledRules: string[];
}

interface FileAnalysis {
	file: string;
	isIncluded: boolean;
	triggeredRules: string[];
}

interface PrintConfigOutput {
	config: BiomeConfig;
	fileAnalysis?: FileAnalysis;
}

// ANSI color codes
const colors = {
	red: "\x1b[0;31m",
	green: "\x1b[0;32m",
	yellow: "\x1b[1;33m",
	blue: "\x1b[0;34m",
	reset: "\x1b[0m",
};

function colorize(text: string, color: keyof typeof colors): string {
	return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(text: string): void {
	console.log();
	console.log(colorize("═".repeat(65), "blue"));
	console.log(colorize(`  ${text}`, "blue"));
	console.log(colorize("═".repeat(65), "blue"));
	console.log();
}

function printSection(text: string): void {
	console.log();
	console.log(colorize(`── ${text} ──`, "yellow"));
	console.log();
}

function runPnpmBiome(args: string[]): string {
	try {
		return execFileSync("pnpm", ["biome", ...args], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		// Return stdout even if command exits with non-zero (e.g., lint violations)
		if (error && typeof error === "object") {
			const err = error as { stdout?: string; stderr?: string };
			// Biome outputs diagnostics to stdout
			return (err.stdout || "") + (err.stderr || "");
		}
		return "";
	}
}

function getBiomeConfig(): BiomeConfig {
	const rageOutput = runPnpmBiome(["rage", "--linter"]);

	// Extract config path
	const configPathMatch = rageOutput.match(/Path:\s+(.+)/);
	const configPath = configPathMatch?.[1]?.trim() ?? "unknown";

	// Extract formatter enabled
	const formatterMatch = rageOutput.match(/Formatter enabled:\s+(\w+)/);
	const formatterEnabled = formatterMatch?.[1]?.trim() === "true";

	// Extract linter enabled
	const linterMatch = rageOutput.match(/Linter enabled:\s+(\w+)/);
	const linterEnabled = linterMatch?.[1]?.trim() === "true";

	// Extract enabled rules
	const rulesSection = rageOutput.split("Enabled rules:")[1];
	const enabledRules: string[] = [];

	if (rulesSection) {
		const lines = rulesSection.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			// Rules are indented with spaces and contain a forward slash
			if (trimmed && trimmed.includes("/") && !trimmed.includes(":")) {
				enabledRules.push(trimmed);
			}
		}
	}

	return {
		configPath,
		formatterEnabled,
		linterEnabled,
		enabledRules: enabledRules.sort(),
	};
}

function analyzeFile(filePath: string): FileAnalysis {
	const absolutePath = resolve(filePath);

	if (!existsSync(absolutePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	const lintOutput = runPnpmBiome(["lint", "--max-diagnostics=none", absolutePath]);

	const isIncluded = !lintOutput.includes("was ignored");

	// Extract triggered rules
	const ruleMatches = lintOutput.match(/lint\/[a-zA-Z]+\/[a-zA-Z]+/g) || [];
	const triggeredRules = [...new Set(ruleMatches)].sort();

	return {
		file: filePath,
		isIncluded,
		triggeredRules,
	};
}

function printConfigText(output: PrintConfigOutput): void {
	printHeader("Biome Lint Configuration");

	printSection("Configuration File");
	console.log(`Path: ${output.config.configPath}`);
	console.log(`Formatter enabled: ${output.config.formatterEnabled}`);
	console.log(`Linter enabled: ${output.config.linterEnabled}`);

	printSection("Globally Enabled Rules");
	console.log(`Total enabled rules: ${output.config.enabledRules.length}`);
	console.log();
	for (const rule of output.config.enabledRules) {
		console.log(rule);
	}

	if (output.fileAnalysis) {
		const { file, isIncluded, triggeredRules } = output.fileAnalysis;

		printSection(`File-Specific Analysis: ${file}`);

		if (!isIncluded) {
			console.log(colorize("File is IGNORED by Biome configuration", "yellow"));
		} else {
			console.log(colorize("File is INCLUDED in linting", "green"));

			printSection("Rules Triggered on This File");

			if (triggeredRules.length === 0) {
				console.log(colorize("No lint violations found", "green"));
			} else {
				for (const rule of triggeredRules) {
					console.log(rule);
				}
				console.log();
				console.log(`Total rules with violations: ${triggeredRules.length}`);
			}
		}
	}

	printSection("Usage");
	console.log("To see all diagnostics for a file, run:");
	console.log("  pnpm biome lint --max-diagnostics=none <file>");
	console.log();
	console.log("To see verbose output:");
	console.log("  pnpm biome lint --verbose <file>");
}

function printConfigJson(output: PrintConfigOutput): void {
	console.log(JSON.stringify(output, null, 2));
}

function main(): void {
	const args = process.argv.slice(2);
	const jsonOutput = args.includes("--json");
	const filePath = args.find((arg) => !arg.startsWith("--"));

	const config = getBiomeConfig();
	const output: PrintConfigOutput = { config };

	if (filePath) {
		try {
			output.fileAnalysis = analyzeFile(filePath);
		} catch (error) {
			if (!jsonOutput) {
				console.error(colorize(`Error: ${(error as Error).message}`, "red"));
			} else {
				console.error(JSON.stringify({ error: (error as Error).message }));
			}
			process.exit(1);
		}
	}

	if (jsonOutput) {
		printConfigJson(output);
	} else {
		printConfigText(output);
	}
}

main();
