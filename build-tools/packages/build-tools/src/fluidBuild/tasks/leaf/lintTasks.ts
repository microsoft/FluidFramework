/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { getEsLintConfigFilePath } from "../../../common/taskUtils";
import { TscDependentTask } from "./tscTask";

export class TsLintTask extends TscDependentTask {
	protected get configFileFullPath() {
		return this.getPackageFileFullPath("tslint.json");
	}
}

export class EsLintTask extends TscDependentTask {
	private _configFileFullPath: string | undefined;
	protected get configFileFullPath() {
		if (!this._configFileFullPath) {
			this._configFileFullPath = getEsLintConfigFilePath(this.package.directory);
			if (!this._configFileFullPath) {
				throw new Error(`Unable to find config file for eslint ${this.command}`);
			}
		}
		return this._configFileFullPath;
	}

	protected get useWorker() {
		if (this.command === "eslint --format stylish src") {
			// eslint can't use worker thread as it needs to change the current working directory
			return this.node.buildContext.workerPool?.useWorkerThreads === false;
		}
		return false;
	}
}
