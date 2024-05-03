/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { type Package, TscUtils } from "@fluidframework/build-tools";
import type { TsConfigJson } from "type-fest";

import { ApiLevel } from "../apiLevel";
import { ApiTag } from "../apiTag";
import { queryOutputMapsFromPackageExports } from "../packageExports";

type PackageName = string;
type Script = string;
/**
 * `${package.name}#${script}`
 */
export type PackageNameAndScript = string;
type AbsoluteFilePath = string;
type ModuleType = "CommonJS" | "ESM";
export interface BuildScript {
	packageName: PackageName;
	script: Script;
	moduleType: ModuleType | undefined;
}

function readArgValues<TQuery extends Record<string, string>>(
	commandLine: string,
	argQuery: TQuery,
): TQuery {
	const values: Record<string, string> = {};
	const args = commandLine.split(" ");
	for (const [argName, defaultValue] of Object.entries(argQuery)) {
		const indexOfArgValue = args.indexOf(`--${argName}`) + 1;
		values[argName] =
			0 < indexOfArgValue && indexOfArgValue < args.length
				? args[indexOfArgValue]
				: defaultValue;
	}
	return values as TQuery;
}

function flubOutput(
	pkg: Package,
	commandLine: string,
): { files: AbsoluteFilePath[]; type: ModuleType | undefined } | undefined {
	if (!commandLine.startsWith("flub generate entrypoints")) {
		// ignored - not recognized as build command
		return undefined;
	}
	const args = readArgValues(commandLine, {
		outDir: "./lib",
		outFilePrefix: "",
		outFilePublic: ApiLevel.public,
		outFileSuffix: ".d.ts",
	});
	const { mapApiTagLevelToOutput } = queryOutputMapsFromPackageExports(
		pkg.packageJson,
		// We are only concerned with public generated
		new Map([[`${args.outDir}/${args.outFilePublic}${args.outFileSuffix}`, ApiTag.public]]),
		false,
	);
	const files: AbsoluteFilePath[] = [];
	let type: ModuleType | undefined;
	for (const output of mapApiTagLevelToOutput.values()) {
		files.push(path.resolve(pkg.directory, output.relPath));
		const fileType = output.conditions.includes("import")
			? "ESM"
			: output.conditions.includes("require")
				? "CommonJS"
				: undefined;
		if (fileType !== undefined) {
			if (type === undefined) {
				type = fileType;
			} else if (type !== fileType) {
				throw new Error(`${pkg.name} "${commandLine}" produces both CommonJS and ESM output`);
			}
		}
	}
	return { files, type };
}

function tscModuleType(
	pkg: Package,
	commandLine: string,
	// module is a string to allow or disparate versions of typescript across the repo and inconsistent
	// ModuleKind enums.
	module: string,
): ModuleType {
	const lcModule = module.toLowerCase();

	if (lcModule.startsWith("node")) {
		if (commandLine.startsWith("fluid-tsc")) {
			if (commandLine.startsWith("fluid-tsc commonjs")) {
				return "CommonJS";
			}
			if (commandLine.startsWith("fluid-tsc module")) {
				return "ESM";
			}
			throw new Error(`fluid-tsc package type not recognized in "${commandLine}"`);
		}

		return pkg.packageJson.type === "module" ? "ESM" : "CommonJS";
	}

	if (lcModule.startsWith("es")) {
		return "ESM";
	}
	if (lcModule === "commonjs") {
		return "CommonJS";
	}

	throw new Error(`tsc compilerOptions.module "${module}" not recognized`);
}

function tscDeclOutput(
	pkg: Package,
	commandLine: string,
): { files: AbsoluteFilePath[]; type: ModuleType } | undefined {
	if (commandLine.includes("--watch")) {
		// --watch commands are special scripts not for use in general build dependencies
		return undefined;
	}

	const packageDir = pkg.directory;

	const tscUtils = TscUtils.getTscUtils(packageDir);

	const parsedCommand = tscUtils.parseCommandLine(commandLine);
	if (!parsedCommand) {
		throw new Error(`Error parsing ${pkg.name} tsc command line: ${commandLine}`);
	}
	const configFile = tscUtils.findConfigFile(packageDir, parsedCommand);
	const configJson = tscUtils.readConfigFile(configFile) as TsConfigJson;
	if (configJson === undefined) {
		throw new Error(`Failed to load config file '${configFile}'`);
	}

	// Fix up relative path from the command line based on the package directory
	const commandOptions = tscUtils.convertOptionPaths(
		parsedCommand.options,
		packageDir,
		(base: string, subpath: string) => path.resolve(base, subpath),
	);

	// Parse the config file relative to the config file directory
	const configDir = path.parse(configFile).dir;
	const ts = tscUtils.tsLib;
	const { fileNames, options } = ts.parseJsonConfigFileContent(
		configJson,
		ts.sys,
		configDir,
		commandOptions,
		configFile,
	);

	const { module } = options;
	if (module === undefined) {
		throw new Error(`${pkg.name} "${commandLine}" tsc compilerOptions.module not specified`);
	}
	const type = tscModuleType(pkg, commandLine, ts.ModuleKind[module]);

	if (options.noEmit ?? false) {
		return { files: [], type };
	}

	const rootDir = options.rootDir ?? ".";
	const outDir = options.outDir ?? ".";
	const inputRegex = /(?:\.d)?(\.[cm]?ts)$/;
	const files = fileNames.map((relSrcPath) => {
		const relOutPath = path.relative(rootDir, relSrcPath.replace(inputRegex, `.d$1`));
		return path.resolve(packageDir, outDir, relOutPath);
	});

	return { files, type };
}

const generationCommands: Partial<
	Record<
		string,
		(
			pkg: Package,
			commandLine: string,
		) =>
			| {
					files: AbsoluteFilePath[];
					type: ModuleType | undefined;
			  }
			| undefined
	>
> = {
	"flub": flubOutput,
	"fluid-tsc": tscDeclOutput,
	"tsc": tscDeclOutput,
};

export class FluidBuildDatabase {
	private readonly outputSource = new Map<AbsoluteFilePath, BuildScript>();

	private readonly packageBuildScripts = new Map<PackageName, Map<Script, BuildScript>>();

	/**
	 * Find build scripts in dependencies that match given scripts module type
	 *
	 * @param packageGroup - map (cache) of packageName's related packages
	 * @param packageName - package name
	 * @param script - packages script name
	 * @returns Array of groups of possible predecessor tasks
	 */
	public getPossiblePredecessorTasks(
		packageGroup: Map<PackageName, Package>,
		packageName: PackageName,
		script: Script,
	): BuildScript[][] {
		const pkg = packageGroup.get(packageName);
		if (pkg === undefined) {
			throw new Error(`${packageName} is not a part of given package group`);
		}

		this.loadPackageAndDependencies(packageGroup, packageName);

		const localBuildScript = this.packageBuildScripts.get(packageName)?.get(script);
		if (localBuildScript === undefined) {
			throw new Error(`${packageName}#${script} is not a recognized build script`);
		}

		const predecessors: BuildScript[][] = [];

		for (const dep of pkg.combinedDependencies) {
			const depPackageName = dep.name;
			const depBuildScripts = this.packageBuildScripts.get(depPackageName);
			if (depBuildScripts !== undefined) {
				const possibleScriptPredecessors: BuildScript[] = [];
				for (const [depScript, { moduleType }] of depBuildScripts.entries()) {
					if (moduleType === undefined || moduleType === localBuildScript.moduleType) {
						possibleScriptPredecessors.push({
							packageName: depPackageName,
							script: depScript,
							moduleType,
						});
					}
				}
				if (possibleScriptPredecessors.length > 0) {
					predecessors.push(possibleScriptPredecessors);
				}
			}
		}

		return predecessors;
	}

	/**
	 * Exact set of predecessor tasks that build given inputs.
	 *
	 * @param packageGroup - map (cache) of packageName's related packages
	 * @param packageName - package name
	 * @param requiredInputs - absolute file paths required
	 * @returns Set of predecessor tasks
	 */
	public getPredecessorTasks(
		packageGroup: Map<PackageName, Package>,
		packageName: PackageName,
		requiredInputs: AbsoluteFilePath[],
	): Set<BuildScript> {
		this.loadPackageAndDependencies(packageGroup, packageName);

		const predecessors = new Set<BuildScript>();
		for (const input of requiredInputs) {
			const predecessor = this.outputSource.get(input);
			if (predecessor === undefined) {
				throw new Error(`no script found that produces ${input}`);
			}
			predecessors.add(predecessor);
		}
		return predecessors;
	}

	private loadPackageAndDependencies(
		packageGroup: Map<PackageName, Package>,
		packageName: PackageName,
	): void {
		if (this.packageBuildScripts.has(packageName)) {
			return;
		}

		const packageBuildScripts = new Map<Script, BuildScript>();
		this.packageBuildScripts.set(packageName, packageBuildScripts);

		const pkg = packageGroup.get(packageName);
		if (pkg === undefined) {
			return;
		}

		// Load local package outputs
		const scripts = pkg.packageJson.scripts ?? {};
		for (const [script, commands] of Object.entries(scripts)) {
			if (commands === undefined) {
				continue;
			}
			const source: BuildScript = { packageName, script, moduleType: undefined };
			const scriptCommandLines = commands.split("&&");
			for (const scriptCommandLine of scriptCommandLines) {
				const scriptCommand = scriptCommandLine.split(" ")[0];
				const outputs = generationCommands[scriptCommand]?.(pkg, scriptCommandLine);
				if (outputs === undefined) {
					// command not known or ignored
					continue;
				}

				packageBuildScripts.set(script, source);

				// Update source moduleType
				if (outputs.type !== undefined) {
					if (source.moduleType !== undefined && outputs.type !== source.moduleType) {
						throw new Error(
							`${packageName} ${script} cumulatively produces both CommonJS and ESM output`,
						);
					}
					source.moduleType = outputs.type;
				}

				// Accumulate output files
				for (const output of outputs.files) {
					const existingSource = this.outputSource.get(output);
					if (existingSource !== undefined) {
						throw new Error(
							`${output} generated by both ${existingSource.packageName}#${
								existingSource.script
							} and ${
								packageName === existingSource.packageName ? "" : packageName
							}#${script}`,
						);
					}
					this.outputSource.set(output, source);
				}
			}
		}

		// Load dependencies outputs too
		for (const directDependency of pkg.combinedDependencies) {
			this.loadPackageAndDependencies(packageGroup, directDependency.name);
		}
	}
}
