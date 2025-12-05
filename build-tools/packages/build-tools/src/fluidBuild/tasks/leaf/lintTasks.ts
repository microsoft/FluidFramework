/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 * 2. ESLint config files as inputs
 * 3. Lock file changes (which captures eslint version changes)
 *
 * This approach ensures that eslint config changes properly invalidate the task,
 * even when no TypeScript compilation occurred.
 */
export class EsLintTask extends LeafWithGlobInputOutputDoneFileTask {
	private _configFileFullPath: string | undefined;

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
	 * Input globs include TypeScript/JavaScript source files and the eslint config file.
	 * The lock file is also included via the includeLockFiles property (default true).
	 */
	protected async getInputGlobs(): Promise<readonly string[]> {
		// Get the relative path to the config file
		const configRelPath = toPosixPath(
			this.configFileFullPath.replace(this.node.pkg.directory, "").replace(/^[/\\]/, ""),
		);

		// Common source file globs for eslint
		return [
			"src/**/*.ts",
			"src/**/*.tsx",
			"src/**/*.js",
			"src/**/*.jsx",
			"src/**/*.mts",
			"src/**/*.mjs",
			"src/**/*.cts",
			"src/**/*.cjs",
			configRelPath,
		];
	}

	/**
	 * ESLint doesn't produce output files - it only validates.
	 * We use an empty array since the task is purely a validation task.
	 */
	protected async getOutputGlobs(): Promise<readonly string[]> {
		return [];
	}
}
