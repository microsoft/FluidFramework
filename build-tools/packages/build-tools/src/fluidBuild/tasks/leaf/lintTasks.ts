/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getEsLintConfigFilePath, getInstalledPackageVersion } from "../taskUtils";
import { TscDependentTask } from "./tscTask";

export class EsLintTask extends TscDependentTask {
	private _configFileFullPath: string | undefined;

	protected get taskSpecificConfigFiles(): string[] {
		if (!this._configFileFullPath) {
			this._configFileFullPath = getEsLintConfigFilePath(this.package.directory);
			if (!this._configFileFullPath) {
				throw new Error(`Unable to find config file for eslint ${this.command}`);
			}
		}

		return [this._configFileFullPath];
	}

	protected get useWorker(): boolean {
		if (this.command === "eslint --format stylish src") {
			// eslint can't use worker thread as it needs to change the current working directory
			return this.node.context.workerPool?.useWorkerThreads === false;
		}
		return false;
	}

	protected async getToolVersion(): Promise<string> {
		return getInstalledPackageVersion("eslint", this.node.pkg.directory);
	}
}
