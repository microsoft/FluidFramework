/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getInstalledPackageVersion } from "../../../common/taskUtils";
import { TscDependentTask } from "./tscTask";

export class ApiExtractorTask extends TscDependentTask {
	protected get configFileFullPaths() {
		// TODO: read all configs used by command via api-extractor simple extension pattern
		const commandArgs = this.command.split(/\s+/);
		const configFileArg = commandArgs.findIndex((arg) => arg === "--config") + 1;
		if (configFileArg !== 0 && commandArgs.length > configFileArg) {
			return [this.getPackageFileFullPath(commandArgs[configFileArg])];
		}

		// Default api-extractor config file name
		return [this.getPackageFileFullPath("api-extractor.json")];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("@microsoft/api-extractor", this.node.pkg.directory);
	}
}
