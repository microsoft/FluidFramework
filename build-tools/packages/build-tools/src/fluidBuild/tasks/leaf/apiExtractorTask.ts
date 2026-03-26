/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getApiExtractorConfigFilePath, getInstalledPackageVersion } from "../taskUtils.js";
import { TscDependentTask } from "./tscTask.js";

export class ApiExtractorTask extends TscDependentTask {
	protected get taskSpecificConfigFiles(): string[] {
		// TODO: read all configs used by command via api-extractor simple extension pattern
		return [this.getPackageFileFullPath(getApiExtractorConfigFilePath(this.command))];
	}

	protected async getToolVersion(): Promise<string> {
		return getInstalledPackageVersion("@microsoft/api-extractor", this.node.pkg.directory);
	}

	protected get useWorker(): boolean {
		return useWorker(this.command);
	}
}

/**
 * Compute if `command` can be handled by `apiExtractorWorker`.
 */
export function useWorker(command: string): boolean {
	// Currently the worker only supports "--local" and "--config config path", both of which are optional.
	const parts = command.split(" ");
	if (parts.length < 2 || parts[0] !== "api-extractor" || parts[1] !== "run") {
		return false;
	}
	let index = 2;
	if (parts[index] === "--local") {
		index++;
	}
	if (parts[index] === "--config") {
		index += 2;
	}
	return index === parts.length;
}
