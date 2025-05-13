/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "node:assert";
import { type BigIntStats, type Stats, existsSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import isEqual from "lodash.isequal";
import * as tsTypes from "typescript";

import { TscUtil, getTscUtils } from "../../tscUtils";
import { getInstalledPackageVersion } from "../taskUtils";
import { LeafTask, LeafWithDoneFileTask } from "./leafTask";

interface ITsBuildInfo {
	program: {
		fileNames: string[];
		fileInfos: (string | { version: string; affectsGlobalScope: true })[];
		affectedFilesPendingEmit?: any[];
		emitDiagnosticsPerFile?: any[];
		semanticDiagnosticsPerFile?: any[];
		changeFileSet?: number[];
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
	private _sourceStats: (Stats | BigIntStats)[] | undefined;
	private _tscUtils: TscUtil | undefined;

	private getTscUtils() {
		if (this._tscUtils) {
			return this._tscUtils;
		}
		this._tscUtils = getTscUtils(this.node.pkg.directory);
		return this._tscUtils;
	}

	protected get executionCommand() {
		const parsedCommandLine = this.parsedCommandLine;
		if (parsedCommandLine?.options.build) {
			// https://github.com/microsoft/TypeScript/issues/57780
			// `tsc -b` by design doesn't rebuild if dependent packages changed
			// but not a referenced project. Just force it if we detected the change and
			// invoke the build.
			// `--force` is not fully supported, due to workaround in createTscUtil, so this may not actually work.
			return `${this.command} --force`;
		}
		return this.command;
	}
	protected get isIncremental() {
		const config = this.readTsConfig();
		return config?.options.incremental;
	}

	protected async checkLeafIsUpToDate() {
		const parsedCommandLine = this.parsedCommandLine;
		if (parsedCommandLine?.options.build) {
			return this.checkReferencesIsUpToDate(
				parsedCommandLine.fileNames.length === 0 ? ["."] : parsedCommandLine.fileNames,
				new Set(),
			);
		}
		// Check is Up to date without project references
		return this.checkTscIsUpToDate();
	}

	private async checkReferencesIsUpToDate(checkDir: string[], checkedProjects: Set<string>) {
		for (const dir of checkDir) {
			if (checkedProjects.has(dir)) {
				continue;
			}
			checkedProjects.add(dir);
			const tempTscTask = new TscTask(
				this.node,
				`tsc -p ${dir}`,
				this.context,
				undefined,
				true,
			);
			if (!(await tempTscTask.checkTscIsUpToDate(checkedProjects))) {
				this.traceTrigger(`project reference ${dir} is not up to date`);
				return false;
			}
		}
		return true;
	}

	private async checkTscIsUpToDate(checkedProjects?: Set<string>) {
		const config = this.readTsConfig();
		if (!config) {
			this.traceTrigger("unable to read ts config");
			return false;
		}

		// Only check project reference if we are in build mode
		if (checkedProjects && config.projectReferences) {
			const referencePaths = config.projectReferences.map((p) => p.path);
			if (!(await this.checkReferencesIsUpToDate(referencePaths, checkedProjects))) {
				return false;
			}
		}

		if (config.fileNames.length === 0) {
			// No file to build, no need to check the the build info.
			return true;
		}

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

		const program = tsBuildInfo.program;
		const noEmit = config.options.noEmit ?? false;
		const hasChangedFiles = (program.changeFileSet?.length ?? 0) > 0;
		const hasEmitErrorsOrPending =
			(program.affectedFilesPendingEmit?.length ?? 0) > 0 ||
			(program.emitDiagnosticsPerFile?.length ?? 0) > 0;
		const hasSemanticErrors =
			program.semanticDiagnosticsPerFile?.some((item) => Array.isArray(item)) ?? false;

		const previousBuildError = noEmit
			? hasChangedFiles || hasSemanticErrors
			: hasChangedFiles || hasSemanticErrors || hasEmitErrorsOrPending;

		// Check previous build errors
		if (previousBuildError) {
			this.traceTrigger("previous build error");
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
		const fileNames = program.fileNames;
		const fileInfos = program.fileInfos;
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
				const hash = await this.node.context.fileHashCache.getFileHash(
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
			this._sourceStats = config ? config.fileNames.map((v) => lstatSync(v)) : [];
		}

		const stat = lstatSync(fullPath);
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
			this.traceTrigger(`ts option changed ${configFileFullPath}`);
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

	private remapOutFile(
		options: tsTypes.ParsedCommandLine,
		directory: string,
		fileName: string,
	) {
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
					const tsBuildInfo = JSON.parse(await readFile(tsBuildInfoFileFullPath, "utf8"));
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
		// force reload
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
				(task) => task instanceof TscTask,
			) as TscTask[];
			const ownTscTasks = tscTasks.filter((task) => task.package == this.package);

			// Take only the tsc task in the same package if possible.
			// Sort by task name to provide some stability
			const tasks = (ownTscTasks.length === 0 ? tscTasks : ownTscTasks).sort((a, b) =>
				a.name.localeCompare(b.name),
			);

			for (const dep of tasks) {
				const tsBuildInfo = await dep.readTsBuildInfo();
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
					configs.push(await readFile(configFile, "utf8"));
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
