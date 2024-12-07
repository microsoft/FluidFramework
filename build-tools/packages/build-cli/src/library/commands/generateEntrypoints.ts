/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { PackageJson } from "@fluidframework/build-tools";
import type { ExportSpecifierStructure, Node } from "ts-morph";
import { ModuleKind, Project, ScriptKind } from "ts-morph";

import type { CommandLogger } from "../../logging.js";
import { ApiLevel } from "../apiLevel.js";
import { ApiTag } from "../apiTag.js";
import type { ExportData, Node10CompatExportData } from "../packageExports.js";
import { queryTypesResolutionPathsFromPackageExports } from "../packageExports.js";
import { getApiExports, getPackageDocumentationText } from "../typescriptApi.js";

import { unscopedPackageNameString } from "./constants.js";

export const optionDefaults = {
	mainEntrypoint: "./src/index.ts",
	outDir: "./lib",
	outFilePrefix: "",
	outFileAlpha: ApiLevel.alpha,
	outFileBeta: ApiLevel.beta,
	outFileLegacy: ApiLevel.legacy,
	outFilePublic: ApiLevel.public,
	outFileSuffix: ".d.ts",
} as const;

/**
 * Returns the path "prefix" for all of the output files.
 * This is the out path + / + any common file prefix.
 */
function getOutPathPrefix(
	{
		outDir,
		outFilePrefix,
	}: {
		/**
		 * {@link GenerateEntrypointsCommand.flags.outDir}.
		 */
		outDir: string;
		/**
		 * {@link GenerateEntrypointsCommand.flags.outFilePrefix}.
		 */
		outFilePrefix: string;
	},
	packageJson: PackageJson,
): string {
	if (!outFilePrefix) {
		// If no other prefix, ensure a trailing path separator.
		// The join with '.' will effectively trim a trailing / or \ from outDir.
		return `${path.join(outDir, ".")}${path.sep}`;
	}

	return path.join(
		outDir,
		outFilePrefix.includes(unscopedPackageNameString)
			? outFilePrefix.replace(
					unscopedPackageNameString,
					getLocalUnscopedPackageName(packageJson),
				)
			: outFilePrefix,
	);
}

function getLocalUnscopedPackageName(packageJson: PackageJson): string {
	const packageName = packageJson.name;
	if (typeof packageName !== "string") {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(`unable to read package name`);
	}

	const unscopedPackageName = /[^/]+$/.exec(packageName)?.[0];
	if (unscopedPackageName === undefined) {
		throw new Error(`unable to parse package name`);
	}

	return unscopedPackageName;
}

export function getOutputConfiguration(
	flags: Readonly<Record<keyof typeof optionDefaults, string>> & { node10TypeCompat: boolean },
	packageJson: PackageJson,
	logger?: CommandLogger,
): {
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>;
	mapApiTagLevelToOutput: Map<ApiTag, ExportData>;
	mapNode10CompatExportPathToData: Map<string, Node10CompatExportData>;
} {
	const {
		outFileSuffix,
		outFileAlpha,
		outFileBeta,
		outFileLegacy,
		outFilePublic,
		node10TypeCompat,
	} = flags;

	const pathPrefix = getOutPathPrefix(flags, packageJson).replace(/\\/g, "/");

	const mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined> = new Map([
		[`${pathPrefix}${outFileAlpha}${outFileSuffix}`, ApiTag.alpha],
		[`${pathPrefix}${outFileBeta}${outFileSuffix}`, ApiTag.beta],
		[`${pathPrefix}${outFilePublic}${outFileSuffix}`, ApiTag.public],
	]);

	// In the past @alpha APIs could be mapped to /legacy via --outFileAlpha.
	// If @alpha is not mapped to same as @legacy, then @legacy can be mapped.
	if (outFileAlpha !== outFileLegacy) {
		mapQueryPathToApiTagLevel.set(
			`${pathPrefix}${outFileLegacy}${outFileSuffix}`,
			ApiTag.legacy,
		);
	}

	if (node10TypeCompat) {
		// /internal export may be supported without API level generation; so
		// add query for such path for Node10 type compat generation.
		const dirPath = pathPrefix.replace(/\/[^/]*$/, "");
		const internalPathRegex = new RegExp(`${dirPath}\\/index\\.d\\.?[cm]?ts$`);
		mapQueryPathToApiTagLevel.set(internalPathRegex, undefined);
	}

	const { mapKeyToOutput: mapApiTagLevelToOutput, mapNode10CompatExportPathToData } =
		queryTypesResolutionPathsFromPackageExports(
			packageJson,
			mapQueryPathToApiTagLevel,
			{ node10TypeCompat, onlyFirstMatches: true },
			logger,
		);

	return {
		mapQueryPathToApiTagLevel,
		mapApiTagLevelToOutput,
		mapNode10CompatExportPathToData,
	};
}

/**
 * Reads command line argument values that are simple value following option like:
 * --optionName value
 *
 * @param commandLine - command line to extract from
 * @param argQuery - record of arguments to read (keys) with default values
 * @returns record of argument values extracted or given default value
 */
function readArgValues<TQuery extends Readonly<Record<string, string>>>(
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

export function getGenerateEntrypointsOutput(
	packageJson: PackageJson,
	commandLine: string,
): IterableIterator<ExportData> {
	// Determine select output from flub generate entrypoints.
	// Fluid packages use two import levels: internal and public.
	// internal is built from tsc and public is generated. It is likely exported
	// as . (root), but what matters is matching command implementation and
	// output for public. So, match required logic bits of normal command.
	// If it were possible, it would be better to use the command code
	// more directly.
	const args = readArgValues(commandLine, optionDefaults);

	const { mapApiTagLevelToOutput } = getOutputConfiguration(
		{ ...args, node10TypeCompat: commandLine.includes("--node10TypeCompat") },
		packageJson,
	);
	return mapApiTagLevelToOutput.values();
}

function sourceContext(node: Node): string {
	return `${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()}`;
}

const generatedHeader: string = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by "flub generate entrypoints" in @fluid-tools/build-cli.
 */

`;

/**
 * Generate "rollup" entrypoints for the given main entrypoint file.
 *
 * @param mainEntrypoint - path to main entrypoint file
 * @param mapApiTagLevelToOutput - level oriented ApiTag to output file mapping
 * @param log - logger
 * @param separateBetaFromAlpha - if true, beta APIs will not be included in alpha outputs
 */
export async function generateEntrypoints(
	mainEntrypoint: string,
	mapApiTagLevelToOutput: Map<ApiTag, ExportData>,
	log: CommandLogger,
	separateBetaFromAlpha: boolean,
): Promise<void> {
	/**
	 * List of out file save promises. Used to collect generated file save
	 * promises so we can await them all at once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	log.info(`Processing: ${mainEntrypoint}`);

	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		// Note: it is likely better to leverage a tsconfig file from package rather than
		// assume Node16 and no other special setup. However, currently configs are pretty
		// standard with simple Node16 module specification and using a tsconfig for just
		// part of its setting may be confusing to document and keep tidy with dual-emit.
		compilerOptions: {
			module: ModuleKind.Node16,

			// Without this, JSX files are not properly handled by ts-morph. "React" is the
			// value we use in our base config, so it should be a safe value.
			jsx: 2 /* JSXEmit.React */,
		},
	});
	const mainSourceFile = project.addSourceFileAtPath(mainEntrypoint);
	const exports = getApiExports(mainSourceFile);

	const packageDocumentationHeader = getPackageDocumentationText(mainSourceFile);
	const newFileHeader = `${generatedHeader}${packageDocumentationHeader}`;

	// This order is critical as alpha should include beta should include public.
	// Legacy is separate and should not be included in any other level. But it
	// may include public.
	//   (public) -> (legacy)
	//           `-> (beta) -> (alpha)
	const apiTagLevels: readonly Exclude<ApiTag, typeof ApiTag.internal>[] = [
		ApiTag.public,
		ApiTag.legacy,
		ApiTag.beta,
		ApiTag.alpha,
	] as const;
	let commonNamedExports: Omit<ExportSpecifierStructure, "kind">[] = [];

	if (exports.unknown.size > 0) {
		log.errorLog(
			`${exports.unknown.size} export(s) found without a recognized API level tag:\n\t${[
				...exports.unknown.entries(),
			]
				.map(
					([name, { exportedDecl, exportDecl }]) =>
						`${name} from ${sourceContext(exportedDecl)}${
							exportDecl === undefined ? "" : ` via ${sourceContext(exportDecl)}`
						}`,
				)
				.join(`\n\t`)}`,
		);

		// Export all unrecognized APIs preserving behavior of api-extractor roll-ups.
		for (const name of [...exports.unknown.keys()].sort()) {
			commonNamedExports.push({ name, leadingTrivia: "\n\t" });
		}
		commonNamedExports[0].leadingTrivia = `\n\t// Unrestricted APIs\n\t`;
		commonNamedExports[commonNamedExports.length - 1].trailingTrivia = "\n";
	}

	for (const apiTagLevel of apiTagLevels) {
		const namedExports = [...commonNamedExports];

		// Append this level's additional (or only) exports sorted by ascending case-sensitive name
		const orgLength = namedExports.length;
		const levelExports = [...exports[apiTagLevel]].sort((a, b) => (a.name > b.name ? 1 : -1));
		for (const levelExport of levelExports) {
			namedExports.push({ ...levelExport, leadingTrivia: "\n\t" });
		}
		if (namedExports.length > orgLength) {
			namedExports[orgLength].leadingTrivia = `\n\t// @${apiTagLevel} APIs\n\t`;
			namedExports[namedExports.length - 1].trailingTrivia = "\n";
		}

		// legacy APIs do not accumulate to others
		if (apiTagLevel !== "legacy") {
			// Additionally, if beta should not accumulate to alpha (alpha may be
			// treated specially such as mapped to /legacy) then skip beta too.
			// eslint-disable-next-line unicorn/no-lonely-if
			if (!separateBetaFromAlpha || apiTagLevel !== "beta") {
				// update common set
				commonNamedExports = namedExports;
			}
		}

		const output = mapApiTagLevelToOutput.get(apiTagLevel);
		if (output === undefined) {
			continue;
		}

		const outFile = output.relPath;
		log.info(`\tGenerating ${outFile}`);
		const sourceFile = project.createSourceFile(outFile, undefined, {
			overwrite: true,
			scriptKind: ScriptKind.TS,
		});

		// Avoid adding export declaration unless there are exports.
		// Adding one without any named exports results in a * export (everything).
		if (namedExports.length > 0) {
			sourceFile.insertText(0, newFileHeader);
			sourceFile.addExportDeclaration({
				leadingTrivia: "\n",
				moduleSpecifier: `./${mainSourceFile
					.getBaseName()
					.replace(/\.(?:d\.)?([cm]?)ts$/, ".$1js")}`,
				namedExports,
			});
		} else {
			// At this point we already know that package "export" has a request
			// for this entrypoint. Warn of emptiness, but make it valid for use.
			log.warning(`no exports for ${outFile} using API level tag ${apiTagLevel}`);
			sourceFile.insertText(0, `${newFileHeader}export {}\n\n`);
		}

		fileSavePromises.push(sourceFile.save());
	}

	await Promise.all(fileSavePromises);
}

export async function generateNode10TypeEntrypoints(
	mapExportPathToData: Map<string, Node10CompatExportData>,
	log: CommandLogger,
): Promise<void> {
	/**
	 * List of out file save promises. Used to collect generated file save
	 * promises so we can await them all at once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	for (const [outFile, { relPath, isTypeOnly }] of mapExportPathToData.entries()) {
		log.info(`\tGenerating ${outFile}`);
		const jsImport = relPath.replace(/\.d\.([cm]?)ts/, ".$1js");
		fileSavePromises.push(
			fs.writeFile(
				outFile,
				isTypeOnly
					? `${generatedHeader}export type * from "${relPath}";\n`
					: `${generatedHeader}export * from "${jsImport}";\n`,
				"utf8",
			),
		);
	}

	if (fileSavePromises.length === 0) {
		log.info(`\tNo Node10 compat files generated.`);
	}

	await Promise.all(fileSavePromises);
}
