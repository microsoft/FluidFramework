/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import {
	getEsLintConfigFilePath,
	getInstalledPackageVersion,
	toPosixPath,
} from "../taskUtils";
import { LeafWithGlobInputOutputDoneFileTask } from "./leafTask";
import { TscDependentTask } from "./tscTask";

export class TsLintTask extends TscDependentTask {
	protected get configFileFullPaths() {
		return [this.getPackageFileFullPath("tslint.json")];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("tslint", this.node.pkg.directory);
	}
}

/**
 * ESLint task that tracks source files and config changes independently.
 *
 * Unlike TscDependentTask, this task tracks:
 * 1. Source files directly via input globs (not via tsc build info)
 * 2. ESLint config files as inputs (both local and shared configs)
 * 3. Lock file changes (which captures eslint version changes)
 *
 * This approach ensures that eslint config changes properly invalidate the task,
 * even when no TypeScript compilation occurred.
 */
export class EsLintTask extends LeafWithGlobInputOutputDoneFileTask {
	private _configFileFullPath: string | undefined;
	private _sharedConfigDir: string | undefined | null;

	/**
	 * Gets the path to the eslint config file for this package.
	 */
	protected get configFileFullPath(): string {
		if (this._configFileFullPath === undefined) {
			const configPath = getEsLintConfigFilePath(this.package.directory);
			if (configPath === undefined) {
				throw new Error(`Unable to find config file for eslint ${this.command}`);
			}
			this._configFileFullPath = configPath;
		}
		return this._configFileFullPath;
	}

	/**
	 * Tries to find the shared eslint-config-fluid directory.
	 * Returns the directory path if found, or null if not available.
	 */
	private get sharedConfigDir(): string | null {
		if (this._sharedConfigDir === undefined) {
			try {
				// Try to resolve @fluidframework/eslint-config-fluid from the package's node_modules
				const resolvedPath = require.resolve("@fluidframework/eslint-config-fluid", {
					paths: [this.node.pkg.directory],
				});
				// The resolved path points to the main file (index.js), so get its directory
				this._sharedConfigDir = path.dirname(resolvedPath);
			} catch {
				// Package not found - this is fine, some packages might not use shared config
				this._sharedConfigDir = null;
			}
		}
		return this._sharedConfigDir;
	}

	/**
	 * Use hashes instead of modified times in donefile for more reliable change detection.
	 */
	protected override get useHashes(): boolean {
		return true;
	}

	protected get useWorker() {
		if (this.command === "eslint --format stylish src") {
			// eslint can't use worker thread as it needs to change the current working directory
			return this.node.context.workerPool?.useWorkerThreads === false;
		}
		return false;
	}

	/**
	 * Parses the eslint command to extract the target directory/file patterns.
	 * ESLint commands typically follow the format: `eslint [options] <files/directories>`
	 *
	 * @returns Array of target paths from the eslint command, or ["src"] as default
	 */
	private getEslintTargets(): string[] {
		// Parse command line arguments, filtering out options (those starting with -)
		const args = this.command.split(/\s+/).slice(1); // Skip "eslint" itself
		const targets: string[] = [];

		for (const arg of args) {
			// Skip option flags and their values
			if (arg.startsWith("-")) {
				continue;
			}
			// Skip known option values that follow flags like --format
			if (["stylish", "compact", "json", "junit", "tap", "unix"].includes(arg)) {
				continue;
			}
			targets.push(arg);
		}

		// Default to "src" if no targets specified
		return targets.length > 0 ? targets : ["src"];
	}

	/**
	 * Gets the absolute paths to shared eslint config files that should be tracked.
	 * These are files from @fluidframework/eslint-config-fluid that affect linting behavior.
	 */
	private getSharedConfigFiles(): string[] {
		const sharedDir = this.sharedConfigDir;
		if (sharedDir === null) {
			return [];
		}

		// Track the main config files from the shared eslint-config-fluid package
		const sharedConfigFiles = [
			"index.js",
			"base.js",
			"strict.js",
			"recommended.js",
			"minimal-deprecated.js",
			"strict-biome.js",
			"package.json", // Tracks version changes
		];

		const files: string[] = [];
		for (const file of sharedConfigFiles) {
			const fullPath = path.join(sharedDir, file);
			if (existsSync(fullPath)) {
				files.push(fullPath);
			}
		}

		return files;
	}

	/**
	 * Input globs include TypeScript/JavaScript source files and the eslint config file.
	 * The lock file is also included via the includeLockFiles property (default true).
	 */
	protected async getInputGlobs(): Promise<readonly string[]> {
		// Get the relative path to the config file using path.relative for cleaner handling
		const configRelPath = toPosixPath(
			path.relative(this.node.pkg.directory, this.configFileFullPath),
		);

		// Get target directories/files from the eslint command
		const targets = this.getEslintTargets();

		// Build input globs based on the eslint targets
		const inputGlobs: string[] = [];
		for (const target of targets) {
			const posixTarget = toPosixPath(target);
			// Add globs for all supported file extensions under each target directory
			inputGlobs.push(
				`${posixTarget}/**/*.ts`,
				`${posixTarget}/**/*.tsx`,
				`${posixTarget}/**/*.js`,
				`${posixTarget}/**/*.jsx`,
				`${posixTarget}/**/*.mts`,
				`${posixTarget}/**/*.mjs`,
				`${posixTarget}/**/*.cts`,
				`${posixTarget}/**/*.cjs`,
			);
		}

		// Add the config file to inputs
		inputGlobs.push(configRelPath);

		return inputGlobs;
	}

	/**
	 * Override getInputFiles to add shared config files as additional inputs.
	 * The base class handles the glob patterns, and we append absolute paths to shared configs.
	 */
	protected override async getInputFiles(): Promise<string[]> {
		const baseInputs = await super.getInputFiles();

		// Add shared eslint-config-fluid files as additional inputs
		const sharedConfigFiles = this.getSharedConfigFiles();

		return [...baseInputs, ...sharedConfigFiles];
	}

	/**
	 * ESLint doesn't produce output files - it only validates.
	 * We use an empty array since the task is purely a validation task.
	 */
	protected async getOutputGlobs(): Promise<readonly string[]> {
		return [];
	}
}
