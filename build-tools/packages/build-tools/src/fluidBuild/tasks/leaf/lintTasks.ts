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
 * Can be overridden with the FLUID_BUILD_ESLINT_CONFIG_PATH environment variable.
 */
const sharedEslintConfigPath =
	process.env.FLUID_BUILD_ESLINT_CONFIG_PATH ?? "common/build/eslint-config-fluid";

export class EsLintTask extends TscDependentTask {
	private _configFileFullPath: string | undefined;
	protected getTaskSpecificConfigFiles() {
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
