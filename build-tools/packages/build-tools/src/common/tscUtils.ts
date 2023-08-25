/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";
import * as ts from "typescript";
import { sha256 } from "./hash";

const defaultTscUtil = getTscUtil(ts);
export const parseCommandLine = defaultTscUtil.parseCommandLine;
export const findConfigFile = defaultTscUtil.findConfigFile;
export const readConfigFile = defaultTscUtil.readConfigFile;

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
	"useDefineForClassFields",

	"skipLibCheck",
	"skipdefaultlibcheck",
	"strict",
].sort(); // sort it so that the result of the filter is sorted as well.

export function filterIncrementalOptions(options: any) {
	const newOptions: any = {};
	for (const key of incrementalOptions) {
		if (options[key] !== undefined) {
			newOptions[key] = options[key];
		}
	}
	return newOptions;
}

export function convertToOptionsWithAbsolutePath(options: ts.CompilerOptions, cwd: string) {
	// Shallow clone 'CompilerOptions' before modifying.
	const result = { ...options };

	// Expand 'string' properties that potentially contain relative paths.
	for (const key of [
		"baseUrl",
		"configFilePath",
		"declarationDir",
		"outDir",
		"rootDir",
		"project",
	]) {
		const value = result[key] as string;
		if (value !== undefined) {
			result[key] = path.resolve(cwd, value);
		}
	}

	// Expand 'string[]' properties that potentially contain relative paths.
	for (const key of ["typeRoots"]) {
		const value = result[key] as string[];
		if (value !== undefined) {
			// Note that this also shallow clones the array.
			result[key] = value.map((relative) => path.resolve(cwd, relative));
		}
	}

	return result;
}

// This is a duplicate of how tsc deal with case insenitive file system as keys (in tsBuildInfo)
function toLowerCase(x: string) {
	return x.toLowerCase();
}
// eslint-disable-next-line no-useless-escape
const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g;

function createGetCanonicalFileName(tsLib: typeof ts) {
	return tsLib.sys.useCaseSensitiveFileNames
		? (x: string) => x
		: (x: string) =>
				fileNameLowerCaseRegExp.test(x)
					? x.replace(fileNameLowerCaseRegExp, toLowerCase)
					: x;
}

export const getCanonicalFileName = createGetCanonicalFileName(ts);

function createGetSourceFileVersion(tsLib: typeof ts) {
	// The TypeScript compiler performs some light preprocessing of the source file
	// text before calculating the file hashes that appear in *.tsbuildinfo.
	//
	// Our options are to either reach into the compiler internals, or duplicate
	// this preprocessing in 'fluid-build'.  Both options are fragile, but since
	// we're already calling into the TypeScript compiler, calling internals is
	// convenient.
	const maybeGetHash = tsLib["getSourceFileVersionAsHashFromText"];

	if (!maybeGetHash) {
		console.warn(
			`Warning: TypeScript compiler has changed.  Incremental builds likely broken.`,
		);

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

export const getSourceFileVersion = createGetSourceFileVersion(ts);

export function getTscUtil(tsLib: typeof ts) {
	return {
		parseCommandLine: (command: string) => {
			// TODO: parse the command line for real, split space for now.
			const args = command.split(" ");

			const parsedCommand = tsLib.parseCommandLine(args.slice(1));
			if (parsedCommand.errors.length) {
				return undefined;
			}
			return parsedCommand;
		},

		findConfigFile: (directory: string, parsedCommand: ts.ParsedCommandLine | undefined) => {
			let tsConfigFullPath: string | undefined;
			const project = parsedCommand?.options.project;
			if (project !== undefined) {
				tsConfigFullPath = path.resolve(directory, project);
			} else {
				const foundConfigFile = tsLib.findConfigFile(
					directory,
					tsLib.sys.fileExists,
					"tsconfig.json",
				);
				if (foundConfigFile) {
					tsConfigFullPath = foundConfigFile;
				} else {
					tsConfigFullPath = path.join(directory, "tsconfig.json");
				}
			}
			return tsConfigFullPath;
		},

		readConfigFile: (path: string) => {
			const configFile = tsLib.readConfigFile(path, tsLib.sys.readFile);
			if (configFile.error) {
				return undefined;
			}
			return configFile.config;
		},
		convertToOptionsWithAbsolutePath,
		getCanonicalFileName: getCanonicalFileName,
		getSourceFileVersion: getSourceFileVersion,
	};
}
