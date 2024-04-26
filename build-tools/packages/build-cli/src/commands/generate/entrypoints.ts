/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { ExportSpecifierStructure, Node } from "ts-morph";
import { ModuleKind, Project, ScriptKind } from "ts-morph";

import { BaseCommand } from "../../base";
import { ApiLevel, ApiTag, getApiExports } from "../../library";
import type { CommandLogger } from "../../logging";

/**
 * Literal pattern to search for in file prefix to replace with unscoped package name.
 *
 * @privateRemarks api-extractor use `<@..>`, but `<>` is problematic for command line
 * specification. A policy incorrectly thinks an argument like that should not be quoted.
 * It is just easier to use an alternate bracket style.
 */
export const unscopedPackageNameString = "{@unscopedPackageName}";

interface ExportData {
	/**
	 * Location of file relative to package
	 */
	relPath: string;
	/**
	 * Export is only .d.ts file
	 */
	isTypeOnly: boolean;
}

/**
 * Generates type declarations files for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateEntrypointsCommand extends BaseCommand<
	typeof GenerateEntrypointsCommand
> {
	static readonly description =
		`Generates type declaration entrypoints for Fluid Framework API levels (/alpha, /beta. etc.) as found in package.json "exports"`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: "./src/index.ts",
			exists: true,
		}),
		outDir: Flags.directory({
			description: "Directory to emit entrypoint declaration files.",
			default: "./lib",
			exists: true,
		}),
		outFilePrefix: Flags.string({
			description: `File name prefix for emitting entrypoint declaration files. Pattern of '${unscopedPackageNameString}' within value will be replaced with the unscoped name of this package.`,
			default: "",
		}),
		outFileAlpha: Flags.string({
			description: "Base file name for alpha entrypoint declaration files.",
			default: ApiLevel.alpha,
		}),
		outFileBeta: Flags.string({
			description: "Base file name for beta entrypoint declaration files.",
			default: ApiLevel.beta,
		}),
		outFilePublic: Flags.string({
			description: "Base file name for public entrypoint declaration files.",
			default: ApiLevel.public,
		}),
		outFileSuffix: Flags.string({
			description:
				"File name suffix including extension for emitting entrypoint declaration files.",
			default: ".d.ts",
		}),
		node10TypeCompat: Flags.boolean({
			description: `Optional generation of Node10 resolution compatible type entrypoints matching others.`,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const {
			mainEntrypoint,
			outFileSuffix,
			outFileAlpha,
			outFileBeta,
			outFilePublic,
			node10TypeCompat,
		} = this.flags;

		const packageJson = await readPackageJson();

		const pathPrefix = getOutPathPrefix(this.flags, packageJson).replace(/\\/g, "/");

		const mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined> = new Map([
			[`${pathPrefix}${outFileAlpha}${outFileSuffix}`, ApiTag.alpha],
			[`${pathPrefix}${outFileBeta}${outFileSuffix}`, ApiTag.beta],
			[`${pathPrefix}${outFilePublic}${outFileSuffix}`, ApiTag.public],
		]);

		if (node10TypeCompat) {
			// /internal export may be supported without API level generation; so
			// add query for such path for Node10 type compat generation.
			const dirPath = pathPrefix.replace(/\/[^/]*$/, "");
			const internalPathRegex = new RegExp(`${dirPath}\\/index\\.d\\.?[cm]?ts$`);
			mapQueryPathToApiTagLevel.set(internalPathRegex, undefined);
		}

		const { mapApiTagLevelToOutputPath, mapExportPathToData } = buildOutputMaps(
			packageJson,
			mapQueryPathToApiTagLevel,
			node10TypeCompat,
			this.logger,
		);

		const promises: Promise<void>[] = [];

		// Requested specific outputs that are not in the output map are explicitly
		// removed for clean incremental build support.
		for (const [outputPath, apiLevel] of mapQueryPathToApiTagLevel.entries()) {
			if (
				apiLevel !== undefined &&
				typeof outputPath === "string" &&
				!mapApiTagLevelToOutputPath.has(apiLevel)
			) {
				promises.push(fs.rm(outputPath, { force: true }));
			}
		}

		if (node10TypeCompat && mapExportPathToData.size === 0) {
			throw new Error(
				'There are no API level "exports" requiring Node10 type compatibility generation.',
			);
		}

		if (mapApiTagLevelToOutputPath.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapQueryPathToApiTagLevel.keys(),
				].join("\n\t")}`,
			);
		}

		promises.push(
			generateEntrypoints(mainEntrypoint, mapApiTagLevelToOutputPath, this.logger),
		);

		if (node10TypeCompat) {
			promises.push(generateNode10TypeEntrypoints(mapExportPathToData, this.logger));
		}

		await Promise.all(promises);
	}
}

async function readPackageJson(): Promise<PackageJson> {
	const packageJson = await fs.readFile("./package.json", { encoding: "utf8" });
	return JSON.parse(packageJson) as PackageJson;
}

function getOutPathPrefix(
	{ outDir, outFilePrefix }: { outDir: string; outFilePrefix: string },
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

/**
 * Only the value types of exports that are records.
 */
type ExportsRecordValue = Exclude<Extract<PackageJson["exports"], object>, unknown[]>;

function findTypesPathMatching(
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>,
	exports: ExportsRecordValue,
): { apiTagLevel: ApiTag | undefined; relPath: string; isTypeOnly: boolean } | undefined {
	for (const [entry, value] of Object.entries(exports)) {
		if (typeof value === "string") {
			if (entry === "types") {
				for (const [key, apiTagLevel] of mapQueryPathToApiTagLevel.entries()) {
					// eslint-disable-next-line max-depth
					if (
						typeof key === "string"
							? path.resolve(value) === path.resolve(key)
							: key.test(value)
					) {
						const isTypeOnly = !(
							"default" in exports ||
							"import" in exports ||
							"require" in exports
						);
						return { apiTagLevel, relPath: value, isTypeOnly };
					}
				}
			}
		} else if (value !== null) {
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathMatching(mapQueryPathToApiTagLevel, value);
			if (deepFind !== undefined) {
				return deepFind;
			}
		}
	}

	return undefined;
}

function buildOutputMaps(
	packageJson: PackageJson,
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>,
	node10TypeCompat: boolean,
	log: CommandLogger,
): {
	mapApiTagLevelToOutputPath: Map<ApiTag, string>;
	mapExportPathToData: Map<string, ExportData>;
} {
	const mapApiTagLevelToOutputPath = new Map<ApiTag, string>();
	const mapExportPathToData = new Map<string, ExportData>();

	const { exports } = packageJson;
	if (typeof exports !== "object" || exports === null) {
		throw new Error('no valid "exports" within package properties');
	}

	if (Array.isArray(exports)) {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(`required entrypoints cannot be generated for "exports" array`);
	}

	// Iterate through exports looking for properties with values matching keys in map.
	for (const [exportPath, exportValue] of Object.entries(exports)) {
		if (typeof exportValue !== "object") {
			log.verbose(`ignoring non-object export path "${exportPath}": "${exportValue}"`);
			continue;
		}
		if (exportValue === null) {
			log.verbose(`ignoring null export path "${exportPath}"`);
			continue;
		}
		if (Array.isArray(exportValue)) {
			log.verbose(`ignoring array export path "${exportPath}"`);
			continue;
		}

		const findResult = findTypesPathMatching(mapQueryPathToApiTagLevel, exportValue);
		if (findResult !== undefined) {
			const { apiTagLevel, relPath, isTypeOnly } = findResult;

			// Add mapping for API level file generation
			if (apiTagLevel !== undefined) {
				if (mapApiTagLevelToOutputPath.has(apiTagLevel)) {
					log.warning(`${relPath} found in exports multiple times.`);
				} else {
					mapApiTagLevelToOutputPath.set(apiTagLevel, relPath);
				}
			}

			// Add mapping for Node10 type compatibility generation if requested.
			// Exclude root "." path as "types" should handle that.
			if (node10TypeCompat && exportPath !== ".") {
				const node10TypeExportPath = exportPath.replace(/(?:\.([cm]?)js)?$/, ".d.$1ts");
				// Nothing needed when export path already matches internal path.
				if (path.resolve(node10TypeExportPath) !== path.resolve(relPath)) {
					mapExportPathToData.set(node10TypeExportPath, {
						relPath,
						isTypeOnly,
					});
				}
			}
		}
	}

	return { mapApiTagLevelToOutputPath, mapExportPathToData };
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
 * Generated by "flub generate entrypoints" in @fluidframework/build-tools.
 */

`;

async function generateEntrypoints(
	mainEntrypoint: string,
	mapApiTagLevelToOutput: Map<ApiTag, string>,
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

	// This order is critical as public should include beta should include alpha.
	const apiTagLevels: readonly Exclude<ApiTag, typeof ApiTag.internal>[] = [
		ApiTag.public,
		ApiTag.beta,
		ApiTag.alpha,
	] as const;
	const namedExports: Omit<ExportSpecifierStructure, "kind">[] = [];

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
			namedExports.push({ name, leadingTrivia: "\n\t" });
		}
		namedExports[0].leadingTrivia = `\n\t// Unrestricted APIs\n\t`;
		namedExports[namedExports.length - 1].trailingTrivia = "\n";
	}

	for (const apiTagLevel of apiTagLevels) {
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

		const outFile = mapApiTagLevelToOutput.get(apiTagLevel);
		if (outFile === undefined) {
			continue;
		}

		log.info(`\tGenerating ${outFile}`);
		const sourceFile = project.createSourceFile(outFile, undefined, {
			overwrite: true,
			scriptKind: ScriptKind.TS,
		});

		// Avoid adding export declaration unless there are exports.
		// Adding one without any named exports results in a * export (everything).
		if (namedExports.length > 0) {
			sourceFile.insertText(0, generatedHeader);
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
			sourceFile.insertText(0, `${generatedHeader}export {}\n\n`);
		}

		fileSavePromises.push(sourceFile.save());
	}

	await Promise.all(fileSavePromises);
}

async function generateNode10TypeEntrypoints(
	mapExportPathToData: Map<string, ExportData>,
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
