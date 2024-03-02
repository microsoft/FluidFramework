/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import * as fs from "fs";
import path from "path";
import * as tsTypes from "typescript";
import isEqual from "lodash.isequal";

import { readFileSync } from "fs-extra";
import { existsSync, readFileAsync } from "../../../common/utils";
import { getInstalledPackageVersion, getRecursiveFiles } from "../../../common/taskUtils";
import { getTscUtils, TscUtil } from "../../../common/tscUtils";
import { LeafTask, LeafWithDoneFileTask } from "./leafTask";

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
	private _tsConfig: tsTypes.ParsedCommandLine | undefined;
	private _tsConfigFullPath: string | undefined;
	private _projectReference: TscTask | undefined;
	private _sourceStats: (fs.Stats | fs.BigIntStats)[] | undefined;
	private _tscUtils: TscUtil | undefined;

	private getTscUtils() {
		if (this._tscUtils) {
			return this._tscUtils;
		}
		this._tscUtils = getTscUtils(this.node.pkg.directory);
		return this._tscUtils;
	}

	protected get isIncremental() {
		const config = this.readTsConfig();
		return config?.options.incremental;
	}
	protected async checkLeafIsUpToDate() {
		const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
		if (tsBuildInfoFileFullPath === undefined) {
			this.traceTrigger("no tsBuildInfo file path");
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
			this.traceTrigger("unable to read ts config");
			return false;
		}

		const tscUtils = this.getTscUtils();

		// Keep a list of files that need to be compiled based on the command line flags and config, and
		// remove the files that we sees from the tsBuildInfo.  The remaining files are
		// new files that need to be rebuilt.
		const configFileNames = new Set(
			config.fileNames.map((p) => tscUtils.getCanonicalFileName(path.normalize(p))),
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
					tscUtils.getSourceFileVersion,
				);
				const version = typeof fileInfo === "string" ? fileInfo : fileInfo.version;
				if (hash !== version) {
					this.traceTrigger(`version mismatch for ${fileName}, ${hash}, ${version}`);
					return false;
				}

				// Remove files that we have built before
				configFileNames.delete(tscUtils.getCanonicalFileName(path.normalize(fullPath)));
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
				this.traceTrigger("mismatched type script version");
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

	private remapSrcDeclFile(fullPath: string, config: tsTypes.ParsedCommandLine) {
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
		options: tsTypes.ParsedCommandLine,
	) {
		const configFileFullPath = this.configFileFullPath;
		if (!configFileFullPath) {
			assert.fail();
		}

		const tscUtils = this.getTscUtils();
		// Patch relative path based on the file directory where the config comes from
		const configOptions = tscUtils.filterIncrementalOptions(
			tscUtils.convertOptionPaths(
				options.options,
				path.dirname(configFileFullPath),
				path.resolve,
			),
		);
		const tsBuildInfoOptions = tscUtils.convertOptionPaths(
			tsBuildInfo.program.options,
			tsBuildInfoFileDirectory,
			path.resolve,
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

			const tscUtils = this.getTscUtils();
			const config = tscUtils.readConfigFile(configFileFullPath);
			if (!config) {
				this.traceError(`ts fail to parse ${configFileFullPath}`);
				return undefined;
			}

			// Fix up relative path from the command line based on the package directory
			const commandOptions = tscUtils.convertOptionPaths(
				parsedCommand.options,
				this.node.pkg.directory,
				path.resolve,
			);

			// Parse the config file relative to the config file directory
			const configDir = path.parse(configFileFullPath).dir;
			const ts = tscUtils.tsLib;
			const options = ts.parseJsonConfigFileContent(
				config,
				ts.sys,
				configDir,
				commandOptions,
				configFileFullPath,
			);

			if (options.errors.length) {
				this.traceError(`ts fail to parse file content ${configFileFullPath}`);
				return undefined;
			}
			this._tsConfig = options;
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

			this._tsConfigFullPath = this.getTscUtils().findConfigFile(
				this.node.pkg.directory,
				parsedCommand,
			);
		}
		return this._tsConfigFullPath;
	}

	private get parsedCommandLine() {
		const parsedCommand = this.getTscUtils().parseCommandLine(this.command);
		if (!parsedCommand) {
			this.traceError(`ts fail to parse command line ${this.command}`);
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

	private remapOutFile(options: tsTypes.ParsedCommandLine, directory: string, fileName: string) {
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
					if (
						tsBuildInfo.program &&
						tsBuildInfo.program.fileNames &&
						tsBuildInfo.program.fileInfos &&
						tsBuildInfo.program.options
					) {
						this._tsBuildInfo = tsBuildInfo;
					} else {
						this.traceError(`Invalid format ${tsBuildInfoFileFullPath}`);
					}
				} catch {
					this.traceError(`Unable to load ${tsBuildInfoFileFullPath}`);
				}
			} else {
				this.traceError(`${tsBuildInfoFileFullPath} file not found`);
			}
		}
		return this._tsBuildInfo;
	}

	protected async markExecDone() {
		this._tsBuildInfo = undefined;

		const config = this.readTsConfig();
		const tsBuildInfoFileFullPath = this.tsBuildInfoFileFullPath;
		const configFileFullPath = this.configFileFullPath;

		// If there are no input, tsc doesn't update the build info file.  Do it manually so we use it for
		// incremental build
		if (tsBuildInfoFileFullPath && configFileFullPath && config?.fileNames.length === 0) {
			const tscUtils = this.getTscUtils();
			// Patch relative path based on the file directory where the config comes from
			const options = tscUtils.filterIncrementalOptions(
				tscUtils.convertOptionPaths(
					config.options,
					path.dirname(tsBuildInfoFileFullPath),
					path.relative,
				),
			);
			const dir = path.dirname(tsBuildInfoFileFullPath);
			if (!existsSync(dir)) {
				await fs.promises.mkdir(dir, { recursive: true });
			}
			await fs.promises.writeFile(
				tsBuildInfoFileFullPath,
				JSON.stringify({
					program: { fileNames: [], fileInfos: [], options },
					version: tscUtils.tsLib.version,
				}),
				"utf8",
			);
		}
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

			const configs: string[] = [];
			const configFiles = this.configFileFullPaths;
			for (const configFile of configFiles) {
				if (existsSync(configFile)) {
					// Include the config file if it exists so that we can detect changes
					configs.push(await readFileAsync(configFile, "utf8"));
				}
			}

			return JSON.stringify({
				version: await this.getToolVersion(),
				configs,
				tsBuildInfoFiles,
			});
		} catch (e) {
			this.traceError(`error generating done file content ${e}`);
			return undefined;
		}
	}
	protected abstract get configFileFullPaths(): string[];
	protected abstract getToolVersion(): Promise<string>;
}

interface TscMultiConfig {
	targets: {
		extName?: string;
		packageOverrides?: Record<string, unknown>;
	}[];
	projects: string[];
}

// This function is mimiced from tsc-multi.
function configKeyForPackageOverrides(overrides: Record<string, unknown> | undefined) {
	if (overrides === undefined) return "";

	const str = JSON.stringify(overrides);

	// An implementation of DJB2 string hashing algorithm
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + c
		hash |= 0; // Convert to 32bit integer
	}
	return `.${hash}`;
}

/**
 * A fluid-build task definition for tsc-multi.
 *
 * This implementation is a hack. It primarily uses the contents of the tsbuildinfo files created by the tsc-multi
 * processes, and duplicates their content into the doneFile. It's duplicative but seems to be the simplest way to get
 * basic incremental support in fluid-build.
 *
 * Source files are also considered for incremental purposes. However, config files outside the package (e.g. shared
 * config files) are not considered. Thus, changes to those files will not trigger a rebuild of downstream packages.
 *
 * Jason-Ha observes that caching is only effective after the second build. But since tsc-multi is just orchestrating
 * tsc, this should be able to derive from {@link TscTask} and override to get to the right config and tsbuildinfo.
 */
export class TscMultiTask extends LeafWithDoneFileTask {
	protected async getToolVersion() {
		return getInstalledPackageVersion("tsc-multi", this.node.pkg.directory);
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		const command = this.command;

		try {
			const commandArgs = command.split(/\s+/);
			const configArg = commandArgs.findIndex((arg) => arg === "--config");
			if (configArg === -1) {
				throw new Error(`no --config argument for tsc-multi command: ${command}`);
			}
			const tscMultiConfigFile = path.resolve(
				this.package.directory,
				commandArgs[configArg + 1],
			);
			commandArgs.splice(configArg, 2);
			commandArgs.shift(); // Remove "tsc-multi" from the command
			// Assume that the remaining arguments are project paths
			const tscMultiProjects = commandArgs.filter((arg) => !arg.startsWith("-"));
			const tscMultiConfig = JSON.parse(
				await readFileAsync(tscMultiConfigFile, "utf-8"),
			) as TscMultiConfig;

			// Command line projects replace any in config projects
			if (tscMultiProjects.length > 0) {
				tscMultiConfig.projects = tscMultiProjects;
			}

			if (tscMultiConfig.projects.length !== 1) {
				throw new Error(
					`TscMultiTask does not support ${command} that does not have exactly one project.`,
				);
			}

			if (tscMultiConfig.targets.length !== 1) {
				throw new Error(
					`TscMultiTask does not support ${tscMultiConfigFile} that does not have exactly one target.`,
				);
			}

			const project = tscMultiConfig.projects[0];
			const projectExt = path.extname(project);
			const target = tscMultiConfig.targets[0];
			const relTsBuildInfoPath = `${project.substring(
				0,
				project.length - projectExt.length,
			)}${target.extName ?? ""}${configKeyForPackageOverrides(
				target.packageOverrides,
			)}.tsbuildinfo`;
			const tsbuildinfoPath = this.getPackageFileFullPath(relTsBuildInfoPath);
			if (!existsSync(tsbuildinfoPath)) {
				// No tsbuildinfo file, so we need to build
				throw new Error(`no tsbuildinfo file found: ${tsbuildinfoPath}`);
			}

			const files = [tscMultiConfigFile, path.resolve(this.package.directory, project)];

			// Add src files
			files.push(...(await getRecursiveFiles(path.resolve(this.package.directory, "src"))));

			// Calculate hashes of all the files; only the hashes will be stored in the donefile.
			const hashesP = files.map(async (name) => {
				const hash = await this.node.buildContext.fileHashCache.getFileHash(
					this.getPackageFileFullPath(name),
				);
				return { name, hash };
			});

			const buildInfo = readFileSync(tsbuildinfoPath).toString();
			const version = await getInstalledPackageVersion("tsc-multi", this.node.pkg.directory);
			const hashes = await Promise.all(hashesP);
			const result = JSON.stringify({
				version,
				buildInfo,
				hashes,
			});
			return result;
		} catch (e) {
			this.traceError(`error generating done file content: ${e}`);
		}
		return undefined;
	}
}
