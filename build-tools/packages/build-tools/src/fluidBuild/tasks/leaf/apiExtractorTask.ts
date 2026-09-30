/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { sha256 } from "../../hash.js";
import { getApiExtractorConfigFilePath, getInstalledPackageVersion } from "../taskUtils.js";
import { TscDependentTask } from "./tscTask.js";

const require = createRequire(import.meta.url);

interface ApiExtractorConfig {
	readonly apiReportEnabled: boolean;
	readonly reportConfigs: readonly { readonly fileName: string }[];
	readonly reportFolder: string;
}

interface ApiExtractorModule {
	readonly ExtractorConfig: {
		loadFileAndPrepare(configFilePath: string): ApiExtractorConfig;
	};
}

/**
 * Gets the generated API report paths from a prepared API Extractor configuration.
 *
 * @param config - The prepared API Extractor configuration.
 * @returns The generated API report paths, or an empty array when API reports are disabled.
 */
export function getApiReportFilePaths(config: ApiExtractorConfig): string[] {
	if (!config.apiReportEnabled) {
		return [];
	}
	return config.reportConfigs.map(({ fileName }) => path.join(config.reportFolder, fileName));
}

/**
 * Gets the current content hashes for the generated API reports.
 *
 * @param config - The prepared API Extractor configuration.
 * @returns The paths and content hashes of the generated API reports.
 */
export async function getApiReportFileState(
	config: ApiExtractorConfig,
): Promise<{ filePath: string; hash: string }[]> {
	return Promise.all(
		getApiReportFilePaths(config).map(async (filePath) => ({
			filePath,
			hash: sha256(await readFile(filePath)),
		})),
	);
}

export class ApiExtractorTask extends TscDependentTask {
	private _apiExtractorConfig: ApiExtractorConfig | undefined;

	protected get taskSpecificConfigFiles(): string[] {
		// TODO: read all configs used by command via api-extractor simple extension pattern
		return [this.getPackageFileFullPath(getApiExtractorConfigFilePath(this.command))];
	}

	protected override async getDoneFileContent(): Promise<string | undefined> {
		const inputState = await super.getDoneFileContent();
		if (inputState === undefined) {
			return undefined;
		}

		const apiReportFileHashes = await getApiReportFileState(this.apiExtractorConfig);
		return JSON.stringify({ inputState, apiReportFileHashes });
	}

	private get apiExtractorConfig(): ApiExtractorConfig {
		if (this._apiExtractorConfig === undefined) {
			const apiExtractorPath = require.resolve("@microsoft/api-extractor", {
				paths: [this.node.pkg.directory],
			});
			// Load the API Extractor version used by the package, which may differ from fluid-build's dependencies.
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const apiExtractorModule = require(apiExtractorPath) as ApiExtractorModule;
			const configFilePath = this.getPackageFileFullPath(
				getApiExtractorConfigFilePath(this.command),
			);
			this._apiExtractorConfig =
				apiExtractorModule.ExtractorConfig.loadFileAndPrepare(configFilePath);
		}
		return this._apiExtractorConfig;
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
