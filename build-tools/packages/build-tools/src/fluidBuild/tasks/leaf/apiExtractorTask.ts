/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import globby from "globby";
import JSON5 from "json5";
import { getApiExtractorConfigFilePath, getInstalledPackageVersion } from "../taskUtils.js";
import { TscDependentTask } from "./tscTask.js";

export class ApiExtractorTask extends TscDependentTask {
	private _resolvedConfig?: ApiExtractorResolvedConfig;

	protected get configFileFullPaths() {
		// TODO: read all configs used by command via api-extractor simple extension pattern
		return [this.getPackageFileFullPath(getApiExtractorConfigFilePath(this.command))];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("@microsoft/api-extractor", this.node.pkg.directory);
	}

	protected get useWorker() {
		return useWorker(this.command);
	}

	/**
	 * Read and resolve API Extractor config to get actual output paths.
	 * This avoids expensive glob patterns by reading the config directly.
	 */
	private async resolveApiExtractorConfig(): Promise<ApiExtractorResolvedConfig | undefined> {
		if (this._resolvedConfig !== undefined) {
			return this._resolvedConfig;
		}

		try {
			const configPath = this.configFileFullPaths[0];
			if (!existsSync(configPath)) {
				return undefined;
			}

			const configContent = await readFile(configPath, "utf-8");
			const config = JSON5.parse(configContent);

			// Resolve extends chain
			const resolvedConfig = await this.resolveConfigExtends(config, path.dirname(configPath));

			// Extract output paths from resolved config
			const pkgDir = this.node.pkg.directory;
			const outputGlobs: string[] = [];

			// API Report files (.api.md)
			if (resolvedConfig.apiReport?.enabled !== false) {
				const reportFolder =
					resolvedConfig.apiReport?.reportFolder ?? "<projectFolder>/api-report/";
				const resolvedFolder = this.resolveConfigPath(reportFolder, pkgDir);
				outputGlobs.push(`${resolvedFolder}/*.api.md`);
			}

			// Doc Model files (.api.json)
			if (resolvedConfig.docModel?.enabled !== false) {
				const apiJsonPath =
					resolvedConfig.docModel?.apiJsonFilePath ??
					"<projectFolder>/_api-extractor-temp/doc-models/<unscopedPackageName>.api.json";
				const resolvedPath = this.resolveConfigPath(apiJsonPath, pkgDir);
				// Get the directory and add a glob pattern
				const docModelDir = path.dirname(resolvedPath);
				outputGlobs.push(`${docModelDir}/*.api.json`);
			}

			// DTS Rollup files
			if (resolvedConfig.dtsRollup?.enabled === true) {
				const rollupPath = resolvedConfig.dtsRollup?.publicTrimmedFilePath;
				if (rollupPath) {
					outputGlobs.push(this.resolveConfigPath(rollupPath, pkgDir));
				}
			}

			this._resolvedConfig = {
				outputGlobs: outputGlobs.map((g) => path.relative(pkgDir, g)),
			};
			return this._resolvedConfig;
		} catch (e: any) {
			this.traceError(`error resolving api-extractor config: ${e.message}`);
			return undefined;
		}
	}

	/**
	 * Resolve config extends chain by reading parent configs.
	 */
	private async resolveConfigExtends(config: any, configDir: string): Promise<any> {
		if (!config.extends) {
			return config;
		}

		const parentPath = path.resolve(configDir, config.extends);
		if (!existsSync(parentPath)) {
			return config;
		}

		const parentContent = await readFile(parentPath, "utf-8");
		const parentConfig = JSON5.parse(parentContent);
		const resolvedParent = await this.resolveConfigExtends(
			parentConfig,
			path.dirname(parentPath),
		);

		// Merge parent and child config (child overrides parent)
		return {
			...resolvedParent,
			...config,
			apiReport: { ...resolvedParent.apiReport, ...config.apiReport },
			docModel: { ...resolvedParent.docModel, ...config.docModel },
			dtsRollup: { ...resolvedParent.dtsRollup, ...config.dtsRollup },
		};
	}

	/**
	 * Resolve API Extractor path tokens like <projectFolder> and <unscopedPackageName>.
	 */
	private resolveConfigPath(configPath: string, pkgDir: string): string {
		let resolved = configPath;
		resolved = resolved.replace(/<projectFolder>/g, pkgDir);
		resolved = resolved.replace(
			/<unscopedPackageName>/g,
			this.node.pkg.name.split("/").pop() ?? "",
		);
		return path.normalize(resolved);
	}

	protected override async getTaskSpecificOutputFiles(): Promise<string[] | undefined> {
		try {
			const pkgDir = this.node.pkg.directory;

			// Try to use config-based detection first (faster and more accurate)
			const resolvedConfig = await this.resolveApiExtractorConfig();
			if (resolvedConfig?.outputGlobs) {
				const outputFiles = await globby(resolvedConfig.outputGlobs, {
					cwd: pkgDir,
					absolute: false,
					gitignore: false,
				});
				return outputFiles;
			}

			// Fallback to optimized glob patterns if config reading fails
			const outputFiles = await globby(
				["api-report/*.api.md", "_api-extractor-temp/**/*.api.json"],
				{
					cwd: pkgDir,
					absolute: false,
					gitignore: false,
				},
			);
			return outputFiles;
		} catch (e: any) {
			this.traceError(`error getting api-extractor output files: ${e.message}`);
			return undefined;
		}
	}
}

interface ApiExtractorResolvedConfig {
	outputGlobs: string[];
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
