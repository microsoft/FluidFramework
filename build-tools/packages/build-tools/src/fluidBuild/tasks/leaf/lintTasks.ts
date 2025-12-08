/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { getEsLintConfigFilePath, getInstalledPackageVersion } from "../taskUtils";
import { TscDependentTask } from "./tscTask";

/**
 * Path to the shared eslint-config-fluid package relative to the repo root.
 */
const sharedEslintConfigPath = "common/build/eslint-config-fluid";

export class TsLintTask extends TscDependentTask {
	protected get configFileFullPaths() {
		return [this.getPackageFileFullPath("tslint.json")];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("tslint", this.node.pkg.directory);
	}
}

export class EsLintTask extends TscDependentTask {
	private _configFileFullPath: string | undefined;
	private _sharedConfigFiles: string[] | undefined;

	/**
	 * Gets the absolute paths to shared eslint config files that should be tracked.
	 * These are files from @fluidframework/eslint-config-fluid that affect linting behavior.
	 */
	private getSharedConfigFiles(): string[] {
		if (this._sharedConfigFiles !== undefined) {
			return this._sharedConfigFiles;
		}

		const sharedDir = path.join(this.context.repoRoot, sharedEslintConfigPath);

		// If the shared config directory doesn't exist, skip tracking
		if (!existsSync(sharedDir)) {
			this._sharedConfigFiles = [];
			return this._sharedConfigFiles;
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

		this._sharedConfigFiles = files;
		return this._sharedConfigFiles;
	}

	protected get configFileFullPaths() {
		if (!this._configFileFullPath) {
			this._configFileFullPath = getEsLintConfigFilePath(this.package.directory);
			if (!this._configFileFullPath) {
				throw new Error(`Unable to find config file for eslint ${this.command}`);
			}
		}

		// Include local config file and shared eslint-config-fluid files
		return [this._configFileFullPath, ...this.getSharedConfigFiles()];
	}

	protected get useWorker() {
		if (this.command === "eslint --format stylish src") {
			// eslint can't use worker thread as it needs to change the current working directory
			return this.node.context.workerPool?.useWorkerThreads === false;
		}
		return false;
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("eslint", this.node.pkg.directory);
	}
}
