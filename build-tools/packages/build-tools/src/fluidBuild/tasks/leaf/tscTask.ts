/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import * as fs from "fs";
import path from "path";
import * as ts from "typescript";

import { defaultLogger } from "../../../common/logging";
import { existsSync, readFileAsync } from "../../../common/utils";
import { getInstalledPackageVersion } from "../../../common/taskUtils";
import * as TscUtils from "../../../common/tscUtils";
import { LeafTask, LeafWithDoneFileTask } from "./leafTask";

const isEqual = require("lodash.isequal");

const { verbose } = defaultLogger;

interface ITsBuildInfo {
	program: {
		fileNames: string[];
		fileInfos: (string | { version: string; affectsGlobalScope: true })[];
		semanticDiagnosticsPerFile?: any[];
		options: any;
	};
	version: string;
}

export class TscTask extends LeafTask {
	private _tsBuildInfoFullPath: string | undefined;
	private _tsBuildInfo: ITsBuildInfo | undefined;
	private _tsConfig: ts.ParsedCommandLine | undefined;
	private _tsConfigFullPath: string | undefined;
	private _projectReference: TscTask | undefined;
	private _sourceStats: (fs.Stats | fs.BigIntStats)[] | undefined;

	protected async checkLeafIsUpToDate() {
		const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
		if (tsBuildInfoFileFullPath === undefined) {
			return false;
		}

		const tsBuildInfoFileDirectory = path.dirname(tsBuildInfoFileFullPath);

		// Using tsc incremental information
		const tsBuildInfo = await this.readTsBuildInfo();
		if (tsBuildInfo === undefined) {
			this.traceTrigger("tsBuildInfo not found");
			return false;
		}

		// Check previous build errors
		const diag = tsBuildInfo.program.semanticDiagnosticsPerFile;
		if (diag?.some((item) => Array.isArray(item))) {
			this.traceTrigger("previous build error");
			return false;
		}

		const config = this.readTsConfig();
		if (!config) {
			return false;
		}

		// Keep a list of files that need to be compiled based on the command line flags and config, and
		// remove the files that we sees from the tsBuildInfo.  The remaining files are
		// new files that need to be rebuilt.
		const configFileNames = new Set(
			config.fileNames.map((p) => TscUtils.getCanonicalFileName(path.normalize(p))),
		);

		// Check dependencies file hashes
		const fileNames = tsBuildInfo.program.fileNames;
		const fileInfos = tsBuildInfo.program.fileInfos;
		for (let i = 0; i < fileInfos.length; i++) {
			const fileInfo = fileInfos[i];
			const fileName = fileNames[i];
			if (fileName === undefined) {
				this.traceTrigger(`missing file name for file info id ${i}`);
				return false;
			}
			try {
				// Resolve relative path based on the directory of the tsBuildInfo file
				let fullPath = path.resolve(tsBuildInfoFileDirectory, fileName);

				// If we have project reference, see if this is in reference to one of the file, and map it to the d.ts file instead
				if (this._projectReference) {
					fullPath = this._projectReference.remapSrcDeclFile(fullPath, config);
				}
				const hash = await this.node.buildContext.fileHashCache.getFileHash(
					fullPath,
					TscUtils.getSourceFileVersion,
				);
				const version = typeof fileInfo === "string" ? fileInfo : fileInfo.version;
				if (hash !== version) {
					this.traceTrigger(`version mismatch for ${fileName}, ${hash}, ${version}`);
					return false;
				}

				// Remove files that we have built before
				configFileNames.delete(TscUtils.getCanonicalFileName(path.normalize(fullPath)));
			} catch (e: any) {
				this.traceTrigger(`exception generating hash for ${fileName}\n\t${e.stack}`);
				return false;
			}
		}

		if (configFileNames.size !== 0) {
			// New files that are not in the previous build, we are not up to date.
			this.traceTrigger(`new file detected ${[...configFileNames.values()].join(",")}`);
			return false;
		}
		try {
			const tsVersion = await getInstalledPackageVersion(
				"typescript",
				this.node.pkg.directory,
			);

			if (tsVersion !== tsBuildInfo.version) {
				this.traceTrigger("previous build error");
				return false;
			}
		} catch (e) {
			this.traceTrigger(
				`Unable to get installed package version for typescript from ${this.node.pkg.directory}`,
			);
			return false;
		}

		// Check tsconfig.json
		return this.checkTsConfig(tsBuildInfoFileDirectory, tsBuildInfo, config);
	}

	private remapSrcDeclFile(fullPath: string, config: ts.ParsedCommandLine) {
		if (!this._sourceStats) {
			this._sourceStats = config ? config.fileNames.map((v) => fs.lstatSync(v)) : [];
		}

		const stat = fs.lstatSync(fullPath);
		if (this._sourceStats.some((value) => isEqual(value, stat))) {
			const parsed = path.parse(fullPath);
			const directory = parsed.dir;
			return this.remapOutFile(config, directory, `${parsed.name}.d.ts`);
		}
		return fullPath;
	}

	private checkTsConfig(
		tsBuildInfoFileDirectory: string,
		tsBuildInfo: ITsBuildInfo,
		options: ts.ParsedCommandLine,
	) {
		const configFileFullPath = this.configFileFullPath;
		if (!configFileFullPath) {
			assert.fail();
		}

		// Patch relative path based on the file directory where the config comes from
		const configOptions = TscUtils.filterIncrementalOptions(
			TscUtils.convertToOptionsWithAbsolutePath(
				options.options,
				path.dirname(configFileFullPath),
			),
		);
		const tsBuildInfoOptions = TscUtils.convertToOptionsWithAbsolutePath(
			tsBuildInfo.program.options,
			tsBuildInfoFileDirectory,
		);

		if (!isEqual(configOptions, tsBuildInfoOptions)) {
			this.traceTrigger(
				`${this.node.pkg.nameColored}: ts option changed ${configFileFullPath}`,
			);
			this.traceTrigger("Config:");
			this.traceTrigger(JSON.stringify(configOptions, undefined, 2));
			this.traceTrigger("BuildInfo:");
			this.traceTrigger(JSON.stringify(tsBuildInfoOptions, undefined, 2));
			return false;
		}
		return true;
	}

	private readTsConfig() {
		if (this._tsConfig == undefined) {
			const parsedCommand = this.parsedCommandLine;
			if (!parsedCommand) {
				return undefined;
			}

			const configFileFullPath = this.configFileFullPath;
			if (!configFileFullPath) {
				return undefined;
			}

			const config = TscUtils.readConfigFile(configFileFullPath);
			if (!config) {
				verbose(`${this.node.pkg.nameColored}: ts fail to parse ${configFileFullPath}`);
				return undefined;
			}

			// Fix up relative path from the command line based on the package directory
			const commandOptions = TscUtils.convertToOptionsWithAbsolutePath(
				parsedCommand.options,
				this.node.pkg.directory,
			);

			// Parse the config file relative to the config file directory
			const configDir = path.parse(configFileFullPath).dir;
			const options = ts.parseJsonConfigFileContent(
				config,
				ts.sys,
				configDir,
				commandOptions,
				configFileFullPath,
			);

			if (options.errors.length) {
				verbose(
					`${this.node.pkg.nameColored}: ts fail to parse file content ${configFileFullPath}`,
				);
				return undefined;
			}
			this._tsConfig = options;

			if (!options.options.incremental) {
				console.warn(`${this.node.pkg.nameColored}: warning: incremental not enabled`);
			}
		}

		return this._tsConfig;
	}
	protected get recheckLeafIsUpToDate() {
		return true;
	}

	private get configFileFullPath() {
		if (this._tsConfigFullPath === undefined) {
			const parsedCommand = this.parsedCommandLine;
			if (!parsedCommand) {
				return undefined;
			}

			this._tsConfigFullPath = TscUtils.findConfigFile(
				this.node.pkg.directory,
				parsedCommand,
			);
		}
		return this._tsConfigFullPath;
	}

	private get parsedCommandLine() {
		const parsedCommand = TscUtils.parseCommandLine(this.command);
		if (!parsedCommand) {
			verbose(`${this.node.pkg.nameColored}: ts fail to parse command line ${this.command}`);
		}
		return parsedCommand;
	}

	private get tsBuildInfoFileName() {
		const configFileFullPath = this.configFileFullPath;
		if (!configFileFullPath) {
			return undefined;
		}

		const configFileParsed = path.parse(configFileFullPath);
		if (configFileParsed.ext === ".json") {
			return `${configFileParsed.name}.tsbuildinfo`;
		}
		return `${configFileParsed.name}${configFileParsed.ext}.tsbuildinfo`;
	}

	private getTsBuildInfoFileFromConfig() {
		const options = this.readTsConfig();
		if (!options || !options.options.incremental) {
			return undefined;
		}

		const outFile = options.options.out ? options.options.out : options.options.outFile;
		if (outFile) {
			return `${outFile}.tsbuildinfo`;
		}

		const configFileFullPath = this.configFileFullPath;
		if (!configFileFullPath) {
			return undefined;
		}

		const tsBuildInfoFileName = this.tsBuildInfoFileName;
		if (!tsBuildInfoFileName) {
			return undefined;
		}

		return this.remapOutFile(options, path.parse(configFileFullPath).dir, tsBuildInfoFileName);
	}

	private remapOutFile(options: ts.ParsedCommandLine, directory: string, fileName: string) {
		if (options.options.outDir) {
			if (options.options.rootDir) {
				const relative = path.relative(options.options.rootDir, directory);
				return path.join(options.options.outDir, relative, fileName);
			}
			return path.join(options.options.outDir, fileName);
		}
		return path.join(directory, fileName);
	}

	private get tsBuildInfoFileFullPath() {
		if (this._tsBuildInfoFullPath === undefined) {
			const infoFile = this.getTsBuildInfoFileFromConfig();
			if (infoFile) {
				if (path.isAbsolute(infoFile)) {
					this._tsBuildInfoFullPath = infoFile;
				} else {
					this._tsBuildInfoFullPath = this.getPackageFileFullPath(infoFile);
				}
			}
		}
		return this._tsBuildInfoFullPath;
	}

	protected getVsCodeErrorMessages(errorMessages: string) {
		const lines = errorMessages.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.length && line[0] !== " ") {
				lines[i] = `${this.node.pkg.directory}/${line}`;
			}
		}
		return lines.join("\n");
	}

	public async readTsBuildInfo(): Promise<ITsBuildInfo | undefined> {
		if (this._tsBuildInfo === undefined) {
			const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
			if (tsBuildInfoFileFullPath && existsSync(tsBuildInfoFileFullPath)) {
				try {
					const tsBuildInfo = JSON.parse(
						await readFileAsync(tsBuildInfoFileFullPath, "utf8"),
					);
					if (tsBuildInfo.program && tsBuildInfo.program.fileNames) {
						this._tsBuildInfo = tsBuildInfo;
					} else {
						verbose(
							`${this.node.pkg.nameColored}: Missing program or fileNames property ${tsBuildInfoFileFullPath}`,
						);
					}
				} catch {
					verbose(
						`${this.node.pkg.nameColored}: Unable to load ${tsBuildInfoFileFullPath}`,
					);
				}
			} else {
				verbose(`${this.node.pkg.nameColored}: ${tsBuildInfoFileFullPath} file not found`);
			}
		}
		return this._tsBuildInfo;
	}

	protected async markExecDone() {
		this._tsBuildInfo = undefined;
	}

	protected get useWorker() {
		// TODO: Worker doesn't implement all mode.  This is not comprehensive filtering yet.
		const parsed = this.parsedCommandLine;
		return (
			parsed !== undefined &&
			(parsed.fileNames.length === 0 || parsed.options.project === undefined) &&
			!parsed.watchOptions
		);
	}
}

// Base class for tasks that are dependent on a tsc compile
export abstract class TscDependentTask extends LeafWithDoneFileTask {
	protected get recheckLeafIsUpToDate() {
		return true;
	}

	protected async getDoneFileContent() {
		try {
			const tsBuildInfoFiles: ITsBuildInfo[] = [];
			const tscTasks = [...this.getDependentLeafTasks()].filter(
				(task) => task.executable === "tsc",
			);
			const ownTscTasks = tscTasks.filter((task) => task.package == this.package);

			// Take only the tsc task in the same package if possible.
			// Sort by task name to provide some stability
			const tasks = (ownTscTasks.length === 0 ? tscTasks : ownTscTasks).sort((a, b) =>
				a.name.localeCompare(b.name),
			);

			for (const dep of tasks) {
				const tsBuildInfo = await (dep as TscTask).readTsBuildInfo();
				if (tsBuildInfo === undefined) {
					// If any of the tsc task don't have build info, we can't track
					return undefined;
				}
				tsBuildInfoFiles.push(tsBuildInfo);
			}

			const configFile = this.configFileFullPath;
			let config = "";
			if (existsSync(configFile)) {
				// Include the config file if it exists so that we can detect changes
				config = await readFileAsync(this.configFileFullPath, "utf8");
			}

			return JSON.stringify({
				version: await this.getToolVersion(),
				config,
				tsBuildInfoFiles,
			});
		} catch (e) {
			this.traceExec(`error generating done file content ${e}`);
			return undefined;
		}
	}
	protected abstract get configFileFullPath(): string;
	protected abstract getToolVersion(): Promise<string>;
}
