/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-named-as-default-member */

import path from "node:path";
import fs from "fs-extra";

import type { PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { ExportSpecifierStructure, Node } from "ts-morph";
import { ModuleKind, Project, ScriptKind } from "ts-morph";

import type { CommandLogger } from "../../logging.js";
import { BaseCommand } from "./base.js";

import { ApiLevel, isLegacy } from "../apiLevel.js";
import type { ExportData, Node10CompatExportData } from "../packageExports.js";
import { queryTypesResolutionPathsFromPackageExports } from "../packageExports.js";
import { getApiExports, getPackageDocumentationText } from "../typescriptApi.js";

import { unscopedPackageNameString } from "./constants.js";

interface Options {
	readonly mainEntrypoint: string;
	readonly outDir: string;
	readonly outFilePrefix: string;

	/**
	 * File path for `@alpha` API entrypoint.
	 */
	readonly outFileAlpha: string;
	/**
	 * File path for `@beta` API entrypoint.
	 */
	readonly outFileBeta: string;
	/**
	 * File path for `@public` API entrypoint.
	 */
	readonly outFilePublic: string;

	/**
	 * File path for `@legacy` + `@alpha` API entrypoint.
	 * @remarks If not specified, no entrypoint will be generated for this API level.
	 */
	readonly outFileLegacyAlpha: string | undefined;
	/**
	 * File path for `@legacy` + `@beta` API entrypoint.
	 * @remarks If not specified, no entrypoint will be generated for this API level.
	 */
	readonly outFileLegacyBeta: string | undefined;
	/**
	 * File path for `@legacy` + `@public` API entrypoint.
	 * @remarks If not specified, no entrypoint will be generated for this API level.
	 */
	readonly outFileLegacyPublic: string | undefined;

	readonly outFileSuffix: string;
}

// For backwards compatibility, the default values for legacy exports are:
// - `outFileLegacyAlpha` is `legacy`, and the others are disabled.
// Future:
// - `outFileLegacyAlpha`: `legacy-alpha`
// - `outFileLegacyBeta`: `legacy-beta`
// - `outFileLegacyPublic`: `legacy-public`
const optionDefaults: Options = {
	mainEntrypoint: "./src/index.ts",
	outDir: "./lib",
	outFilePrefix: "",
	outFileAlpha: "alpha",
	outFileBeta: "beta",
	outFilePublic: "public",
	outFileLegacyAlpha: "legacy", // Back compat
	outFileLegacyBeta: undefined,
	outFileLegacyPublic: undefined,
	outFileSuffix: ".d.ts",
};

/**
 * Generates type declarations files for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export class GenerateEntrypointsCommand extends BaseCommand<
	typeof GenerateEntrypointsCommand
> {
	static readonly description =
		`Generates type declaration entrypoints for Fluid Framework API levels (/alpha, /beta. etc.) as found in package.json "exports"`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: optionDefaults.mainEntrypoint,
			exists: true,
		}),
		outDir: Flags.directory({
			description: "Directory to emit entrypoint declaration files.",
			default: optionDefaults.outDir,
			exists: true,
		}),
		outFilePrefix: Flags.string({
			description: `File name prefix for emitting entrypoint declaration files. Pattern of '${unscopedPackageNameString}' within value will be replaced with the unscoped name of this package.`,
			default: optionDefaults.outFilePrefix,
		}),
		outFileAlpha: Flags.string({
			description: "Base file name for alpha entrypoint declaration files.",
			default: optionDefaults.outFileAlpha,
		}),
		outFileBeta: Flags.string({
			description: "Base file name for beta entrypoint declaration files.",
			default: optionDefaults.outFileBeta,
		}),
		outFilePublic: Flags.string({
			description: "Base file name for public entrypoint declaration files.",
			default: optionDefaults.outFilePublic,
		}),
		outFileLegacyAlpha: Flags.string({
			description: "Base file name for legacyAlpha entrypoint declaration files.",
			default: optionDefaults.outFileLegacyAlpha,
		}),
		outFileLegacyBeta: Flags.string({
			description: "Base file name for legacyBeta entrypoint declaration files.",
			default: optionDefaults.outFileLegacyBeta,
		}),
		outFileLegacyPublic: Flags.string({
			description: "Base file name for legacyPublic entrypoint declaration files.",
			default: optionDefaults.outFileLegacyPublic,
		}),
		outFileSuffix: Flags.string({
			description:
				"File name suffix including extension for emitting entrypoint declaration files.",
			default: optionDefaults.outFileSuffix,
		}),
		node10TypeCompat: Flags.boolean({
			description: `Optional generation of Node10 resolution compatible type entrypoints matching others.`,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint, node10TypeCompat } = this.flags;

		const packageJson = await readPackageJson();

		const {
			mapQueryPathToApiTagLevel,
			mapApiTagLevelToOutput,
			mapNode10CompatExportPathToData,
		} = getOutputConfiguration(this.flags, packageJson, this.logger);

		const promises: Promise<void>[] = [];

		// Requested specific outputs that are not in the output map are explicitly
		// removed for clean incremental build support.
		for (const [outputPath, apiLevel] of mapQueryPathToApiTagLevel.entries()) {
			if (
				apiLevel !== undefined &&
				typeof outputPath === "string" &&
				!mapApiTagLevelToOutput.has(apiLevel)
			) {
				promises.push(fs.rm(outputPath, { force: true }));
			}
		}

		if (node10TypeCompat && mapNode10CompatExportPathToData.size === 0) {
			throw new Error(
				'There are no API level "exports" requiring Node10 type compatibility generation.',
			);
		}

		if (mapApiTagLevelToOutput.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapQueryPathToApiTagLevel.keys(),
				].join("\n\t")}`,
			);
		}

		promises.push(generateEntrypoints(mainEntrypoint, mapApiTagLevelToOutput, this.logger));

		if (node10TypeCompat) {
			promises.push(
				generateNode10TypeEntrypoints(mapNode10CompatExportPathToData, this.logger),
			);
		}

		// All of the output actions (deletes of stale files or writing of new/updated files)
		// are all independent and can be done in parallel.
		await Promise.all(promises);
	}
}

async function readPackageJson(): Promise<PackageJson> {
	const packageJson = await fs.readFile("./package.json", { encoding: "utf8" });
	return JSON.parse(packageJson) as PackageJson;
}

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

function getOutputConfiguration(
	flags: Options & { node10TypeCompat: boolean },
	packageJson: PackageJson,
	logger?: CommandLogger,
): {
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiLevel | undefined>;
	mapApiTagLevelToOutput: Map<ApiLevel, ExportData>;
	mapNode10CompatExportPathToData: Map<string, Node10CompatExportData>;
} {
	const {
		outFileSuffix,
		outFileAlpha,
		outFileBeta,
		outFilePublic,
		outFileLegacyAlpha,
		outFileLegacyBeta,
		outFileLegacyPublic,
		node10TypeCompat,
	} = flags;

	const pathPrefix = getOutPathPrefix(flags, packageJson).replace(/\\/g, "/");

	const outFileToApiLevelEntries: [string, ApiLevel][] = [
		[outFileAlpha, ApiLevel.alpha],
		[outFileBeta, ApiLevel.beta],
		[outFilePublic, ApiLevel.public],
	];

	if (outFileLegacyAlpha !== undefined) {
		outFileToApiLevelEntries.push([outFileLegacyAlpha, ApiLevel.legacyAlpha]);
	}
	if (outFileLegacyBeta !== undefined) {
		outFileToApiLevelEntries.push([outFileLegacyBeta, ApiLevel.legacyBeta]);
	}
	if (outFileLegacyPublic !== undefined) {
		outFileToApiLevelEntries.push([outFileLegacyPublic, ApiLevel.legacyPublic]);
	}

	const mapQueryPathToApiTagLevel: Map<string | RegExp, ApiLevel | undefined> = new Map();
	for (const [outFile, apiLevel] of outFileToApiLevelEntries) {
		const queryPath = `${pathPrefix}${outFile}${outFileSuffix}`;
		if (mapQueryPathToApiTagLevel.has(queryPath)) {
			throw new Error(
				`The same outFile "${outFile}" is requested for multiple API levels: ${mapQueryPathToApiTagLevel.get(queryPath)} and ${apiLevel}. Please ensure that each API level is configured with a unique outFile.`,
			);
		}
		mapQueryPathToApiTagLevel.set(queryPath, apiLevel);
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
function readArgValues(commandLine: string, argQuery: Options): Options {
	const values: Record<string, string | undefined> = {};
	const args = commandLine.split(" ");

	const argValues: Record<string, string | undefined> = {};
	for (const argName of Object.keys(argQuery)) {
		const indexOfArgValue = args.indexOf(`--${argName}`) + 1;
		if (indexOfArgValue && indexOfArgValue < args.length){
			values[argName] = args[indexOfArgValue];
		}
	}
	return {
		...argQuery,
		...argValues
	};
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
 */
async function generateEntrypoints(
	mainEntrypoint: string,
	mapApiTagLevelToOutput: ReadonlyMap<ApiLevel, ExportData>,
	log: CommandLogger,
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
	//   (legacyPublic) -> (legacyBeta)    -> (legacyAlpha)
	//         ^                ^                  ^
	//         |                |                  |
	//      (public)    ->    (beta)       ->    (alpha)
	const apiLevels: readonly Exclude<ApiLevel, typeof ApiLevel.internal>[] = [
		ApiLevel.public,
		ApiLevel.legacyPublic,
		ApiLevel.beta,
		ApiLevel.legacyBeta,
		ApiLevel.alpha,
		ApiLevel.legacyAlpha,
	] as const;
	const commonNamedExports: Omit<ExportSpecifierStructure, "kind">[] = [];

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
		commonNamedExports[0].leadingTrivia = `\n\t// #region Unrestricted APIs\n\t`;
		commonNamedExports[commonNamedExports.length - 1].trailingTrivia = "\n\t// #endregion\n\t";
	}

	log.info(`Generating entrypoints...`);
	log.info(`- Public APIs: ${exports.public.length}`);
	log.info(`- Beta APIs: ${exports.beta.length}`);
	log.info(`- Alpha APIs: ${exports.alpha.length}`);
	log.info(`- Legacy Public APIs: ${exports.legacyPublic.length}`);
	log.info(`- Legacy Beta APIs: ${exports.legacyBeta.length}`);
	log.info(`- Legacy Alpha APIs: ${exports.legacyAlpha.length}`);

	const semVerExports = [...commonNamedExports];
	const legacyExports = [...commonNamedExports];

	for (const apiLevel of apiLevels) {
		log.info(`\tProcessing @${apiLevel} APIs...`);

		const isLegacyRelease = isLegacy(apiLevel);

		// Generate this level's additional (or only) exports sorted by ascending case-sensitive name
		const levelExports = [...exports[apiLevel]].sort((a, b) => (a.name > b.name ? 1 : -1));

		const levelSectionExports: Omit<ExportSpecifierStructure, "kind">[] = [];
		for (const levelExport of levelExports) {
			levelSectionExports.push({ ...levelExport, leadingTrivia: "\n\t" });
		}
		if (levelSectionExports.length > 0) {
			levelSectionExports[0].leadingTrivia = `\n\t// #region @${apiLevel} APIs\n\t`;
			levelSectionExports[levelSectionExports.length - 1].trailingTrivia =
				`\n\t// #endregion\n`;
		}

		// Accumulate exports for next applicable level(s).
		// Note: non-legacy APIs accumulate to legacy exports, but
		// legacy exports do not accumulate to non-legacy exports.
		legacyExports.push(...levelSectionExports);
		if (!isLegacyRelease) {
			semVerExports.push(...levelSectionExports);
		}

		const output = mapApiTagLevelToOutput.get(apiLevel);
		if (output === undefined) {
			log.info(`\tNo output for ${apiLevel} APIs, skipping`);
			continue;
		}

		const outFile = output.relPath;
		log.info(`\tFound output for ${apiLevel} APIs. Generating ${outFile}`);
		const sourceFile = project.createSourceFile(outFile, undefined, {
			overwrite: true,
			scriptKind: ScriptKind.TS,
		});

		const namedExports = isLegacyRelease ? legacyExports : semVerExports;

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
			log.warning(`no exports for ${outFile} using API level tag ${apiLevel}`);
			sourceFile.insertText(0, `${newFileHeader}export {}\n\n`);
		}

		fileSavePromises.push(sourceFile.save());
	}

	await Promise.all(fileSavePromises);
}

async function generateNode10TypeEntrypoints(
	mapExportPathToData: ReadonlyMap<string, Node10CompatExportData>,
	log: CommandLogger,
): Promise<void> {
	log.info(`Generating Node10 entrypoints...`);

	/**
	 * List of out file save promises. Used to collect generated file save
	 * promises so we can await them all at once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	async function createEntrypointFile(filePath: string, content: string): Promise<void> {
		await fs.ensureDir(path.dirname(filePath));
		await fs.writeFile(filePath, content, "utf8");
	}

	for (const [outFile, { relPath, isTypeOnly }] of mapExportPathToData.entries()) {
		log.info(`\tGenerating ${outFile}`);
		const jsImport = relPath.replace(/\.d\.([cm]?)ts/, ".$1js");
		fileSavePromises.push(
			createEntrypointFile(
				outFile,
				isTypeOnly
					? `${generatedHeader}export type * from "${relPath}";\n`
					: `${generatedHeader}export * from "${jsImport}";\n`,
			),
		);
	}

	if (fileSavePromises.length === 0) {
		log.info(`\tNo Node10 compat files generated.`);
	}

	await Promise.all(fileSavePromises);
}
