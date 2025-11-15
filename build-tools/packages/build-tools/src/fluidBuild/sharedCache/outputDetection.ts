/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import glob from "glob";
import type { OutputDetectionStrategy } from "./types.js";

/**
 * File snapshot entry containing path and modification time.
 */
interface FileSnapshot {
	path: string;
	mtimeMs: number;
	hash?: string;
}

/**
 * Detects output files by taking filesystem snapshots before and after execution.
 *
 * This strategy:
 * - Captures all files and their modification times before task execution
 * - Captures state again after execution
 * - Identifies new or modified files by comparing timestamps
 *
 * Pros:
 * - Detects all outputs automatically without configuration
 * - Handles dynamic filenames and unpredictable output locations
 *
 * Cons:
 * - More overhead (scanning filesystem twice)
 * - May capture unrelated files if other processes are writing
 */
export class FileSystemSnapshotStrategy implements OutputDetectionStrategy {
	private beforeSnapshot: Map<string, FileSnapshot> = new Map();
	private afterSnapshot: Map<string, FileSnapshot> = new Map();
	private readonly baseDir: string;
	private readonly excludePatterns: string[];

	/**
	 * Create a filesystem snapshot strategy.
	 *
	 * @param baseDir - Root directory to scan (typically package root)
	 * @param excludePatterns - Glob patterns to exclude from scanning (e.g., node_modules, .git)
	 */
	constructor(
		baseDir: string,
		excludePatterns: string[] = ["**/node_modules/**", "**/.git/**"],
	) {
		this.baseDir = baseDir;
		this.excludePatterns = excludePatterns;
	}

	/**
	 * Capture filesystem state before task execution.
	 *
	 * @returns Set of file paths that existed before execution
	 */
	async beforeExecution(): Promise<Set<string>> {
		this.beforeSnapshot = await this.captureSnapshot();
		return new Set(this.beforeSnapshot.keys());
	}

	/**
	 * Capture filesystem state after task execution.
	 *
	 * @returns Set of file paths that exist after execution
	 */
	async afterExecution(): Promise<Set<string>> {
		this.afterSnapshot = await this.captureSnapshot();
		return new Set(this.afterSnapshot.keys());
	}

	/**
	 * Get files that were created or modified during execution.
	 *
	 * @returns Array of absolute file paths
	 */
	getNewFiles(): string[] {
		const newFiles: string[] = [];

		for (const [filePath, afterInfo] of this.afterSnapshot) {
			const beforeInfo = this.beforeSnapshot.get(filePath);

			// New file: didn't exist before
			if (!beforeInfo) {
				newFiles.push(filePath);
				continue;
			}

			// Modified file: modification time changed
			if (afterInfo.mtimeMs > beforeInfo.mtimeMs) {
				newFiles.push(filePath);
			}
		}

		return newFiles;
	}

	/**
	 * Capture a snapshot of all files in the base directory.
	 *
	 * @returns Map of file paths to their metadata
	 */
	private async captureSnapshot(): Promise<Map<string, FileSnapshot>> {
		const snapshot = new Map<string, FileSnapshot>();

		try {
			// Use glob to find all files, respecting exclude patterns
			const files = await new Promise<string[]>((resolve, reject) => {
				glob(
					"**/*",
					{
						cwd: this.baseDir,
						ignore: this.excludePatterns,
						nodir: true,
						absolute: true,
						dot: false, // Don't include hidden files by default
					},
					(err, matches) => {
						if (err) {
							reject(err);
						} else {
							resolve(matches);
						}
					},
				);
			});

			// Capture modification time for each file
			await Promise.all(
				files.map(async (filePath) => {
					try {
						const stats = await fs.stat(filePath);
						snapshot.set(filePath, {
							path: filePath,
							mtimeMs: stats.mtimeMs,
						});
					} catch (error) {
						// File may have been deleted between glob and stat - ignore
					}
				}),
			);
		} catch (error) {
			console.warn(
				`Warning: Failed to capture filesystem snapshot: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return snapshot;
	}
}

/**
 * Detects output files using predefined glob patterns.
 *
 * This strategy:
 * - Uses task-defined glob patterns to match output files
 * - Optionally captures hashes before/after to detect modifications
 * - Faster than filesystem snapshots but requires configuration
 *
 * Pros:
 * - Fast and efficient (only checks specified patterns)
 * - Predictable and explicit about expected outputs
 * - Good for tasks with known output patterns
 *
 * Cons:
 * - Requires manual configuration of glob patterns
 * - May miss outputs if patterns are incomplete
 * - Doesn't handle truly dynamic filenames well
 */
export class GlobPatternStrategy implements OutputDetectionStrategy {
	private beforeFiles: Set<string> = new Set();
	private afterFiles: Set<string> = new Set();
	private readonly baseDir: string;
	private readonly patterns: string[];
	private readonly excludePatterns: string[];

	/**
	 * Create a glob pattern strategy.
	 *
	 * @param baseDir - Root directory for pattern matching (typically package root)
	 * @param patterns - Glob patterns to match output files (e.g., "dist/**\/*.js", "lib/**\/*.d.ts")
	 * @param excludePatterns - Glob patterns to exclude
	 */
	constructor(
		baseDir: string,
		patterns: string[],
		excludePatterns: string[] = ["**/node_modules/**"],
	) {
		this.baseDir = baseDir;
		this.patterns = patterns;
		this.excludePatterns = excludePatterns;
	}

	/**
	 * Capture files matching patterns before task execution.
	 *
	 * @returns Set of file paths that matched patterns before execution
	 */
	async beforeExecution(): Promise<Set<string>> {
		this.beforeFiles = await this.matchFiles();
		return new Set(this.beforeFiles);
	}

	/**
	 * Capture files matching patterns after task execution.
	 *
	 * @returns Set of file paths that match patterns after execution
	 */
	async afterExecution(): Promise<Set<string>> {
		this.afterFiles = await this.matchFiles();
		return this.afterFiles;
	}

	/**
	 * Get files that match patterns and are new or were modified.
	 *
	 * For glob pattern strategy, we return all files that match patterns
	 * after execution. This includes both new and existing files.
	 *
	 * @returns Array of absolute file paths
	 */
	getNewFiles(): string[] {
		return Array.from(this.afterFiles);
	}

	/**
	 * Find all files matching the configured glob patterns.
	 *
	 * @returns Set of absolute file paths
	 */
	private async matchFiles(): Promise<Set<string>> {
		const matchedFiles = new Set<string>();

		try {
			// Process each pattern
			for (const pattern of this.patterns) {
				const files = await new Promise<string[]>((resolve, reject) => {
					glob(
						pattern,
						{
							cwd: this.baseDir,
							ignore: this.excludePatterns,
							nodir: true,
							absolute: true,
						},
						(err, matches) => {
							if (err) {
								reject(err);
							} else {
								resolve(matches);
							}
						},
					);
				});

				for (const file of files) {
					matchedFiles.add(file);
				}
			}
		} catch (error) {
			console.warn(
				`Warning: Failed to match glob patterns: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return matchedFiles;
	}
}

/**
 * Hybrid strategy that combines filesystem snapshot with glob pattern filtering.
 *
 * This strategy:
 * - Takes filesystem snapshots like FileSystemSnapshotStrategy
 * - Filters results to only include files matching specified patterns
 * - Provides balance between automatic detection and explicit configuration
 *
 * Pros:
 * - Automatic detection of modifications within expected output directories
 * - More efficient than full filesystem scan
 * - Handles dynamic filenames within known output locations
 *
 * Cons:
 * - Still requires some configuration (output directory patterns)
 * - More overhead than pure glob pattern strategy
 */
export class HybridDetectionStrategy implements OutputDetectionStrategy {
	private readonly snapshotStrategy: FileSystemSnapshotStrategy;
	private readonly patterns: string[];
	private readonly baseDir: string;

	/**
	 * Create a hybrid detection strategy.
	 *
	 * @param baseDir - Root directory to scan
	 * @param patterns - Glob patterns to filter snapshot results (e.g., "dist/**", "lib/**")
	 * @param excludePatterns - Patterns to exclude from snapshot
	 */
	constructor(
		baseDir: string,
		patterns: string[],
		excludePatterns: string[] = ["**/node_modules/**", "**/.git/**"],
	) {
		this.baseDir = baseDir;
		this.patterns = patterns;
		this.snapshotStrategy = new FileSystemSnapshotStrategy(baseDir, excludePatterns);
	}

	/**
	 * Capture filesystem state before execution.
	 *
	 * @returns Set of file paths before execution
	 */
	async beforeExecution(): Promise<Set<string>> {
		return this.snapshotStrategy.beforeExecution();
	}

	/**
	 * Capture filesystem state after execution.
	 *
	 * @returns Set of file paths after execution
	 */
	async afterExecution(): Promise<Set<string>> {
		return this.snapshotStrategy.afterExecution();
	}

	/**
	 * Get new/modified files that match the configured patterns.
	 *
	 * Simple pattern matching: checks if file paths start with pattern prefixes.
	 * For more complex patterns, consider upgrading to glob v10+ with minimatch support.
	 *
	 * @returns Array of absolute file paths
	 */
	getNewFiles(): string[] {
		const allNewFiles = this.snapshotStrategy.getNewFiles();

		// Filter to only include files matching patterns
		// Simple implementation: check if relative path matches pattern prefix
		const filteredFiles = allNewFiles.filter((filePath) => {
			const relativePath = path.relative(this.baseDir, filePath);
			return this.patterns.some((pattern) => {
				// Remove glob wildcards for simple prefix matching
				const prefix = pattern.replace(/\*\*/g, "").replace(/\*/g, "");
				return relativePath.startsWith(prefix) || relativePath.includes(prefix);
			});
		});

		return filteredFiles;
	}
}

/**
 * Factory function to create appropriate output detection strategy based on task configuration.
 *
 * @param taskType - Type of task (tsc, eslint, webpack, etc.)
 * @param baseDir - Package root directory
 * @param outputGlobs - Optional glob patterns for outputs (from task config)
 * @returns Appropriate OutputDetectionStrategy instance
 */
export function createOutputDetectionStrategy(
	taskType: string,
	baseDir: string,
	outputGlobs?: string[],
): OutputDetectionStrategy {
	// If explicit output globs are provided, use glob pattern strategy
	if (outputGlobs && outputGlobs.length > 0) {
		return new GlobPatternStrategy(baseDir, outputGlobs);
	}

	// Task-specific defaults
	switch (taskType.toLowerCase()) {
		case "tsc":
		case "typescript":
			// TypeScript outputs to dist/ or lib/ typically
			return new HybridDetectionStrategy(baseDir, ["dist/**", "lib/**", "**/*.tsbuildinfo"]);

		case "eslint":
		case "tslint":
			// Linters typically don't produce outputs, but may create done files
			return new GlobPatternStrategy(baseDir, ["**/*.done.build.log"]);

		case "webpack":
		case "rollup":
		case "esbuild":
			// Bundlers typically output to dist/ or build/
			return new HybridDetectionStrategy(baseDir, ["dist/**", "build/**", "bundle/**"]);

		case "api-extractor":
			// API Extractor outputs to specific locations
			return new GlobPatternStrategy(baseDir, [
				"**/api-report/*.api.md",
				"**/*.api.json",
				"**/dist/*.d.ts",
			]);

		default:
			// For unknown tasks, use full filesystem snapshot
			// This is safer but has more overhead
			return new FileSystemSnapshotStrategy(baseDir);
	}
}
