/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import * as fs from "fs";
import * as path from "path";
import type * as ts54Types from "typescript-5.4";
import type * as ts59Types from "typescript-5.9";
import type * as ts60Types from "typescript-6.0";
import { sha256 } from "./hash.js";

const require = createRequire(import.meta.url);

type tsTypes = typeof ts54Types | typeof ts59Types | typeof ts60Types;

/**
 * Matches fluid-tsc command start.
 * Upon match index 1 and group.type will be "commonjs"|"module".
 * Remaining string will be tsc arguments.
 */
export const fluidTscRegEx = /^fluid-tsc\s+(?<type>commonjs|module)/;

// See convertToProgramBuildInfoCompilerOptions in typescript src/compiler/builder.ts
const incrementalOptions = [
	// affectsEmit === true
	"assumeChangesOnlyAffectDirectDependencies",
	"target",
	"listFilesOnly",
	"module",
	"jsx",
	"declaration",
	"declarationMap",
	"emitDeclarationOnly",
	"sourceMap",
	"outFile",
	"outDir",
	"rootDir",
	"composite",
	"tsBuildInfoFile",
	"removeComments",
	"importHelpers",
	"importsNotUsedAsValues",
	"downlevelIteration",
	"esModuleInterop",
	"sourceRoot",
	"mapRoot",
	"inlineSourceMap",
	"inlineSources",
	"emitDecoratorMetadata",
	"jsxImportSource",
	"out",
	"reactNamespace",
	"emitBOM",
	"newLine",
	"stripInternal",
	"noEmitHelpers",
	"noEmitOnError",
	"preserveConstEnums",
	"declarationDir",
	"useDefineForClassFields",
	"preserveValueImports",
	"allowJs",

	// affectsSemanticDiagnostics === true
	"noImplicitAny",
	"strictNullChecks",
	"strictPropertyInitialization",
	"noImplicitThis",
	"useUnknownInCatchVariables",
	"noUnusedLocals",
	"noUnusedParameters",
	"exactOptionalPropertyTypes",
	"noImplicitReturns",
	"noFallthroughCasesInSwitch",
	"noUncheckedIndexedAccess",
	"noImplicitOverride",
	"allowSyntheticDefaultImports",
	"allowUmdGlobalAccess",
	"experimentalDecorators",
	"noErrorTruncation",
	"noImplicitUseStrict",
	"allowUnusedLabels",
	"allowUnreachableCode",
	"suppressExcessPropertyErrors",
	"suppressImplicitAnyIndexErrors",
	"noStrictGenericChecks",

	"skipLibCheck",
	"strict",
	"strictBindCallApply",
	"strictFunctionTypes",
	"checkJs",
].sort(); // sort it so that the result of the filter is sorted as well.

function filterIncrementalOptions(options: any): Record<string, unknown> {
	const newOptions: any = {};
	for (const key of incrementalOptions) {
		if (options[key] !== undefined) {
			newOptions[key] = options[key];
		}
	}
	return newOptions;
}

function convertOptionPaths<
	TCompilerOptions extends
		| ts54Types.CompilerOptions
		| ts59Types.CompilerOptions
		| ts60Types.CompilerOptions,
>(
	options: TCompilerOptions,
	base: string,
	convert: (base: string, path: string) => string,
): TCompilerOptions {
	// Shallow clone 'CompilerOptions' before modifying.
	const result = { ...options };

	// Convert 'string' properties that potentially contain paths.
	for (const key of [
		"baseUrl",
		"configFilePath",
		"declarationDir",
		"outDir",
		"rootDir",
		"project",
		"tsBuildInfoFile",
	]) {
		const value = result[key] as string;
		if (value !== undefined) {
			result[key] = convert(base, value);
		}
	}

	// Convert 'string[]' properties that potentially contain paths.
	for (const key of ["typeRoots"]) {
		const value = result[key] as string[];
		if (value !== undefined) {
			// Note that this also shallow clones the array.
			result[key] = value.map((value) => convert(base, value));
		}
	}

	return result;
}

// This is a duplicate of how tsc deal with case insensitive file system as keys (in tsBuildInfo)
function toLowerCase(x: string): string {
	return x.toLowerCase();
}
// eslint-disable-next-line no-useless-escape
const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g;

function createGetCanonicalFileName(tsLib: tsTypes): (x: string) => string {
	return tsLib.sys.useCaseSensitiveFileNames
		? (x: string): string => x
		: (x: string): string =>
				fileNameLowerCaseRegExp.test(x) ? x.replace(fileNameLowerCaseRegExp, toLowerCase) : x;
}

function createGetSourceFileVersion(tsLib: tsTypes): (buffer: Buffer) => string {
	// The TypeScript compiler performs some light preprocessing of the source file
	// text before calculating the file hashes that appear in *.tsbuildinfo.
	//
	// Our options are to either reach into the compiler internals, or duplicate
	// this preprocessing in 'fluid-build'.  Both options are fragile, but since
	// we're already calling into the TypeScript compiler, calling internals is
	// convenient.
	const maybeGetHash = tsLib["getSourceFileVersionAsHashFromText"];

	if (!maybeGetHash) {
		// This internal function is added 5.0+
		if (parseInt(tsLib.versionMajorMinor.split(".")[0]) >= 5) {
			console.warn(
				`Warning: TypeScript compiler has changed.  Incremental builds likely broken.`,
			);
		}

		// Return 'sha256' for compatibility with older versions of TypeScript while we're
		// transitioning.
		return sha256;
	}

	return (buffer: Buffer): string => {
		return maybeGetHash(
			{
				createHash: sha256,
			},
			buffer.toString(),
		);
	};
}

/**
 * Convert a union of types to an intersection of types.
 *
 * @privateRemarks
 * First an always true extends clause is used (T extends T) to distribute T
 * into to a union of types contravariant over each member of the T union.
 * Then the constraint on the type parameter in this new context is inferred,
 * giving the intersection.
 *
 * See {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#distributive-conditional-types|Distributive conditional types}
 * and {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types|Inference in conditional types} in TS Handbook for more details and examples.
 */
export type UnionToIntersection<T> = (T extends T ? (k: T) => unknown : never) extends (
	k: infer U,
) => unknown
	? U
	: never;

/**
 * TypeScript compiler utilities created for a specific TypeScript library instance.
 */
export interface TscUtil<TSTypes extends tsTypes = tsTypes> {
	tsLib: TSTypes;
	parseCommandLine: (command: string) => ReturnType<TSTypes["parseCommandLine"]> | undefined;
	findConfigFile: (
		directory: string,
		parsedCommand: ReturnType<TSTypes["parseCommandLine"]> | undefined,
	) => string | undefined;
	readConfigFile: (path: string) => unknown;
	filterIncrementalOptions: typeof filterIncrementalOptions;
	convertOptionPaths: typeof convertOptionPaths<
		ReturnType<TSTypes["parseCommandLine"]>["options"]
	>;
	getCanonicalFileName: (x: string) => string;
	getSourceFileVersion: (buffer: Buffer) => string;
	/**
	 * Cast helper for generic use context that always targets a single TypeScript version.
	 *
	 * @remarks
	 * options value give should always originate from the version that will consume the output.
	 *
	 * @param options Options specific to certain version of TypeScript
	 * @returns Casted version of options that can be given to any TypeScript and therefore also to the specific version.
	 */
	castOptionsUnionToIntersection: (
		options: ReturnType<TSTypes["parseCommandLine"]>["options"],
	) => UnionToIntersection<ReturnType<TSTypes["parseCommandLine"]>["options"]>;
	/**
	 * Cast helper to most basic version of TypeScript (oldest supported)
	 * @param ts Any of the supported typescript modules
	 * @returns Most basic version of typescript
	 */
	baseTs: (ts: TSTypes) => typeof ts54Types;
}

function createTscUtil<TSTypes extends tsTypes>(tsLib: TSTypes): TscUtil<TSTypes> {
	return {
		tsLib,
		parseCommandLine: (
			command: string,
		): ReturnType<TSTypes["parseCommandLine"]> | undefined => {
			// TODO: parse the command line for real, split space for now.
			// In case of fluid-tsc, replace those parts with 'tsc' before split.
			const args = command.replace(fluidTscRegEx, "tsc").split(" ");
			if (command.includes("&&")) {
				console.warn("Warning: '&&' is not supported in tsc command.");
			}

			const slicedArgs = args.slice(1);

			// TypeScript uses a separate parseBuildCommand() API for `tsc -b`.
			// In TS <5.9, parseCommandLine() also accepted `-b`, but 5.9 removed
			// that. Use isBuildCommand/parseBuildCommand when available (TS 5.9+),
			// otherwise fall back to parseCommandLine which handles it.
			if ("isBuildCommand" in tsLib && tsLib.isBuildCommand(slicedArgs)) {
				const buildResult = tsLib.parseBuildCommand(slicedArgs);
				if (buildResult.errors.length) {
					console.error(
						`Error parsing tsc build command: ${command} (split into ${JSON.stringify(slicedArgs)}).`,
					);
					for (const error of buildResult.errors) {
						console.error(error);
					}
					return undefined;
				}
				// Map parseBuildCommand result to ParsedCommandLine shape so
				// callers can check options.build and use fileNames for projects.
				const result = {
					options: { build: true },
					fileNames: buildResult.projects,
					errors: [],
				} satisfies ts54Types.ParsedCommandLine satisfies ts59Types.ParsedCommandLine satisfies ts60Types.ParsedCommandLine;
				return result as ReturnType<TSTypes["parseCommandLine"]>;
			}

			let filteredArgs = slicedArgs;
			// workaround for https://github.com/microsoft/TypeScript/issues/59095
			// TODO: This breaks --force (by removing it). Find a way to fix --force.
			// See code in leaf/tscTask.ts which adds --force.
			if (filteredArgs.at(-1) === "--force") {
				filteredArgs = filteredArgs.slice(0, filteredArgs.length - 1);
			}
			const parsedCommand = tsLib.parseCommandLine(filteredArgs);

			if (parsedCommand.errors.length) {
				console.error(
					`Error parsing tsc command: ${command} (split into ${JSON.stringify(filteredArgs)}).`,
				);
				for (const error of parsedCommand.errors) {
					console.error(error);
				}
				return undefined;
			}

			return parsedCommand as ReturnType<TSTypes["parseCommandLine"]>;
		},

		findConfigFile: (
			directory: string,
			parsedCommand: ReturnType<TSTypes["parseCommandLine"]> | undefined,
		): string | undefined => {
			let tsConfigFullPath: string | undefined;
			const project = parsedCommand?.options.project;
			if (project !== undefined) {
				tsConfigFullPath = path.resolve(directory, project);
				if (fs.existsSync(tsConfigFullPath) && fs.statSync(tsConfigFullPath).isDirectory()) {
					tsConfigFullPath = path.join(tsConfigFullPath, "tsconfig.json");
				}
			} else {
				// Does a search from given directory and up to find tsconfig.json.
				const foundConfigFile = tsLib.findConfigFile(
					directory,
					tsLib.sys.fileExists,
					"tsconfig.json",
				);
				if (foundConfigFile) {
					tsConfigFullPath = foundConfigFile;
				} else {
					// Assume there will be a local tsconfig.json and it is just currently missing.
					tsConfigFullPath = path.join(directory, "tsconfig.json");
					console.warn(`Warning: no config file found; assuming ${tsConfigFullPath}`);
				}
			}
			return tsConfigFullPath;
		},

		readConfigFile: (path: string): unknown => {
			const configFile = tsLib.readConfigFile(path, tsLib.sys.readFile);
			if (configFile.error) {
				return undefined;
			}
			return configFile.config;
		},
		filterIncrementalOptions,
		convertOptionPaths,
		getCanonicalFileName: createGetCanonicalFileName(tsLib),
		getSourceFileVersion: createGetSourceFileVersion(tsLib),
		castOptionsUnionToIntersection: (
			options: ReturnType<TSTypes["parseCommandLine"]>["options"],
		) =>
			options as unknown as UnionToIntersection<
				ReturnType<TSTypes["parseCommandLine"]>["options"]
			>,
		baseTs: (ts: TSTypes) => ts as typeof ts54Types,
	};
}

const tscUtilPathCache = new Map<string, TscUtil>();
const tscUtilLibPathCache = new Map<string, TscUtil>();

export function getTscUtils(path: string): TscUtil {
	const tscUtilFromPath = tscUtilPathCache.get(path);
	if (tscUtilFromPath) {
		return tscUtilFromPath;
	}

	try {
		const tsPath = require.resolve("typescript", { paths: [path] });
		const tscUtilFromLibPath = tscUtilLibPathCache.get(tsPath);
		if (tscUtilFromLibPath) {
			tscUtilPathCache.set(path, tscUtilFromLibPath);
			return tscUtilFromLibPath;
		}

		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const tsLib: tsTypes = require(tsPath);
		const tscUtil = createTscUtil(tsLib);
		tscUtilPathCache.set(path, tscUtil);
		tscUtilLibPathCache.set(tsPath, tscUtil);
		return tscUtil;
	} catch (e: any) {
		e.message = `Failed to load typescript module for '${path}'. 'typescript' dependency may be missing.: ${e.message}`;
		throw e;
	}
}

// Any paths given by typescript will be normalized to forward slashes.
// Local paths should be normalized to make any comparisons.
export function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * A parsed tsc config, as returned by {@link getResolvedTsConfig}. This is the union of the
 * supported TypeScript versions' `ParsedCommandLine` types.
 */
export type ResolvedTsConfig =
	| ts54Types.ParsedCommandLine
	| ts59Types.ParsedCommandLine
	| ts60Types.ParsedCommandLine;

/**
 * Resolves the effective tsc compiler options for a project by parsing its config file
 * (including any `extends`) and merging in the option overrides from the parsed command line.
 * Command line options take precedence. Relative paths from the command line are resolved
 * relative to {@link packageDir}; the config file is parsed relative to its own directory.
 *
 * @param tscUtils - Utilities bound to the TypeScript version used by the package.
 * @param packageDir - The package directory, used to resolve relative command line paths.
 * @param parsedCommand - The parsed tsc command line (see {@link TscUtil.parseCommandLine}).
 * @param configFileFullPath - The absolute path to the project's config file.
 * @returns The resolved config, or `undefined` if the config could not be read or parsed.
 */
export function getResolvedTsConfig(
	tscUtils: TscUtil,
	packageDir: string,
	parsedCommand: ResolvedTsConfig,
	configFileFullPath: string,
): ResolvedTsConfig | undefined {
	const config = tscUtils.readConfigFile(configFileFullPath);
	if (!config) {
		return undefined;
	}

	// Fix up relative paths from the command line based on the package directory.
	const commandOptions = tscUtils.convertOptionPaths(
		parsedCommand.options,
		packageDir,
		path.resolve,
	);

	// Parse the config file relative to the config file directory, with command line options
	// taking precedence.
	const ts = tscUtils.tsLib;
	const options = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		path.dirname(configFileFullPath),
		tscUtils.castOptionsUnionToIntersection(commandOptions),
		configFileFullPath,
	);

	if (options.errors.length) {
		return undefined;
	}
	return options;
}

/**
 * Computes the default incremental build info file name (`*.tsbuildinfo`) for a config file,
 * matching how tsc derives it from the config file name.
 */
function getTsBuildInfoFileName(configFileFullPath: string): string {
	const configFileParsed = path.parse(configFileFullPath);
	if (configFileParsed.ext === ".json") {
		return `${configFileParsed.name}.tsbuildinfo`;
	}
	return `${configFileParsed.name}${configFileParsed.ext}.tsbuildinfo`;
}

/**
 * Remaps a file that would be emitted next to the config/source into the configured output
 * directory, matching how tsc places emitted files (and the incremental build info file).
 */
export function remapOutFile(
	options: ResolvedTsConfig,
	directory: string,
	fileName: string,
): string {
	if (options.options.outDir) {
		if (options.options.rootDir) {
			const relative = path.relative(options.options.rootDir, directory);
			return path.join(options.options.outDir, relative, fileName);
		}
		return path.join(options.options.outDir, fileName);
	}
	return path.join(directory, fileName);
}

/**
 * Computes the incremental build info (`*.tsbuildinfo`) file that a tsc invocation would write,
 * relative to the package as configured, or `undefined` if the invocation is not incremental
 * (and therefore does not write one).
 *
 * @param options - The resolved config (see {@link getResolvedTsConfig}).
 * @param configFileFullPath - The absolute path to the project's config file.
 */
export function getTsBuildInfoFileFromConfig(
	options: ResolvedTsConfig,
	configFileFullPath: string,
): string | undefined {
	if (!options.options.incremental) {
		return undefined;
	}

	if (options.options.tsBuildInfoFile) {
		return options.options.tsBuildInfoFile;
	}

	const outFile = options.options.out ? options.options.out : options.options.outFile;
	if (outFile) {
		return `${outFile}.tsbuildinfo`;
	}

	const tsBuildInfoFileName = getTsBuildInfoFileName(configFileFullPath);
	return remapOutFile(options, path.parse(configFileFullPath).dir, tsBuildInfoFileName);
}

/**
 * Computes the absolute path of the incremental build info (`*.tsbuildinfo`) file that a tsc
 * invocation would write, or `undefined` if the invocation is not incremental.
 *
 * @param options - The resolved config (see {@link getResolvedTsConfig}).
 * @param packageDir - The package directory, used to resolve a relative build info path.
 * @param configFileFullPath - The absolute path to the project's config file.
 */
export function getTsBuildInfoFullPath(
	options: ResolvedTsConfig,
	packageDir: string,
	configFileFullPath: string,
): string | undefined {
	const infoFile = getTsBuildInfoFileFromConfig(options, configFileFullPath);
	if (infoFile === undefined) {
		return undefined;
	}
	return path.isAbsolute(infoFile) ? infoFile : path.join(packageDir, infoFile);
}
