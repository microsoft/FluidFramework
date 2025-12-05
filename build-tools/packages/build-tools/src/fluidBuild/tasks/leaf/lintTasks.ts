/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { getEsLintConfigFilePath, getInstalledPackageVersion } from "../taskUtils";
import { TscDependentTask } from "./tscTask";

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
	private _sharedConfigDir: string | undefined | null;

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
