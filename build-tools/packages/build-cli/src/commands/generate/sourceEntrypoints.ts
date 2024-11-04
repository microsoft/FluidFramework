/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import { Flags } from "@oclif/core";
import JSON5 from "json5";
import * as resolve from "resolve.exports";
import type { ExportSpecifierStructure, Node } from "ts-morph";
import { ModuleKind, Project, ScriptKind } from "ts-morph";
import type { TsConfigJson } from "type-fest";

import type { Logger, PackageJson } from "@fluidframework/build-tools";

// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { isKnownApiTag } from "../../library/apiTag.js";
import { ApiLevel, ApiTag, BaseCommand } from "../../library/index.js";
import {
	readPackageJson,
	readTsConfig,
	// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/package.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import type { ExportData } from "../../library/packageExports.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { getApiExports, getPackageDocumentationText } from "../../library/typescriptApi.js";
import type { CommandLogger } from "../../logging.js";

/**
 * Generates source entrypoints for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateSourceEntrypointsCommand extends BaseCommand<
	typeof GenerateSourceEntrypointsCommand
> {
	static readonly description =
		`Generates TypeScript source files that roll up APIs into different entrypoint files, defined by the "exports" field in package.json and organized by API tags`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: "./src/index.ts",
			exists: true,
		}),
		outDir: Flags.directory({
			description: "Directory to emit entrypoint files.",
			default: "./src/entrypoints/",
			exists: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint, outDir } = this.flags;

		const packageJson = await readPackageJson();

		// Read tsconfig present at the root of the package
		const tsConfig = await readTsConfig();

		const mapApiTagToExportPath: Map<ApiTag, ExportData> = mapExportPathToApiTag(
			packageJson,
			tsConfig,
			this.logger,
		);

		const mapApiTagToSourcePath: Map<string, ApiTag> = await mapSourcePathToApiTag(outDir);

		const mapSourceToExportPath: Map<ApiTag, ExportData> = getOutputConfiguration(
			mapApiTagToSourcePath,
			mapApiTagToExportPath,
			this.logger,
		);

		if (mapSourceToExportPath.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapApiTagToSourcePath.keys(),
				].join("\n\t")}`,
			);
		}

		// generate source entrypoints under `${outDir}`
		return generateSourceEntrypoints(mainEntrypoint, mapSourceToExportPath, this.logger);
	}
}

// Formats the given output directory path to ensure it starts with `./` and ends with `/`.
function formatPath(outDir: string): string {
	return `./${outDir.replace(/^\.\/|\/$/g, "")}/`;
}

/**
 * Read and parse tsconfig under `outDir`
 * @returns rootDir
 */
async function readOutDirTsConfig(outDir: string): Promise<string> {
	const formatOutDir = formatPath(outDir);

	// Read tsconfig under `${outDir}`
	const tsConfigContent = await fs.readFile(`${formatOutDir}tsconfig.json`, {
		encoding: "utf8",
	});

	if (tsConfigContent === undefined) {
		throw new Error(`tsconfig.json not found in ${formatOutDir}`);
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const tsconfig = JSON5.parse(tsConfigContent);

	let rootDir = "";

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	if (tsconfig.compilerOptions?.rootDir !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		rootDir = tsconfig.compilerOptions?.rootDir;
	}

	if (rootDir.length === 0 || rootDir === undefined) {
		throw new Error(`No rootDir defined in ${formatOutDir}tsconfig.json`);
	}

	return formatPath(rootDir);
}

/**
 * Returns a map of source paths to `ApiTag` levels.
 */
async function mapSourcePathToApiTag(outDir: string): Promise<Map<string, ApiTag>> {
	const rootDir = await readOutDirTsConfig(outDir);

	const outFileSuffix = ".ts";

	return new Map([
		[`${rootDir}${ApiLevel.alpha}${outFileSuffix}`, ApiTag.alpha],
		[`${rootDir}${ApiLevel.beta}${outFileSuffix}`, ApiTag.beta],
		[`${rootDir}${ApiLevel.public}${outFileSuffix}`, ApiTag.public],
		[`${rootDir}${ApiLevel.legacy}${outFileSuffix}`, ApiTag.legacy],
	]);
}

/**
 * Resolves a mapping of `ApiTag` levels to their modified export paths.
 */
function getOutputConfiguration(
	mapApiTagToSourcePath: ReadonlyMap<string, ApiTag>,
	mapApiTagToExportPath: Map<ApiTag, ExportData>,
	logger: CommandLogger,
): Map<ApiTag, ExportData> {
	const result = new Map<ApiTag, ExportData>();
	for (const [sourcePath, apiTag] of mapApiTagToSourcePath) {
		// Check if apiTag exists in mapApiTagToOutputPath
		const exportPath = mapApiTagToExportPath.get(apiTag);
		if (exportPath) {
			// Modify the exportPath
			const modifiedExportPath = exportPath.relPath
				.replace(/(lib|dist)/g, "src")
				.replace(/\.js$|\.d\.ts$/, ".ts");

			if (result.has(apiTag)) {
				logger?.warning(`${modifiedExportPath} found in exports multiple times.`);
			} else if (sourcePath === modifiedExportPath) {
				result.set(apiTag, { ...exportPath, relPath: modifiedExportPath });
			}
		}
	}

	return result;
}

/**
 * Read package "exports" to determine which "default"/ "types" paths to return along with `ApiTag`.
 *
 * @param packageJson - json content of package.json
 * @param emitDeclarationOnly - If true, "types" exports are considered.
 * @param logger - optional Logger
 * @returns Map with API tags or levels with export path data
 */
function mapExportPathToApiTag(
	packageJson: PackageJson,
	tsconfig: TsConfigJson,
	logger?: Logger,
): Map<ApiTag, ExportData> {
	const mapKeyToOutput = new Map<ApiTag, ExportData>();

	let emitDeclarationOnly = false;
	if (tsconfig.compilerOptions?.emitDeclarationOnly !== undefined) {
		emitDeclarationOnly = tsconfig.compilerOptions.emitDeclarationOnly;
	}

	const { exports } = packageJson;

	if (typeof exports !== "object" || exports === null) {
		throw new Error('no valid "exports" within package properties');
	}

	// Iterate through exports looking for properties with values matching keys in map.
	for (const [exportPath] of Object.entries(exports)) {
		const resolvedExport = resolve.exports(packageJson, exportPath, {
			conditions: emitDeclarationOnly ? ["types"] : ["default"],
		});
		if (resolvedExport === undefined || resolvedExport.length === 0) {
			throw new Error(`exports for ${exportPath} is undefined`);
		}

		const level = exportPath === "." ? ApiTag.public : exportPath.replace("./", "");

		if (!isKnownApiTag(level)) {
			throw new Error(`${exportPath} is not a known API tag`);
		}

		if (level === ApiTag.internal) {
			continue;
		}

		if (mapKeyToOutput.has(level)) {
			logger?.warning(`${resolvedExport[0]} found in exports multiple times.`);
		} else {
			mapKeyToOutput.set(level, {
				relPath: resolvedExport[0],
				conditions: [],
				isTypeOnly: emitDeclarationOnly,
			});
		}
	}

	return mapKeyToOutput;
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
 * Generated by "flub generate sourceEntrypoints" in @fluid-tools/build-cli.
 */

`;

/**
 * Generate "rollup" entrypoints for the given main entrypoint file.
 *
 * @param mainEntrypoint - path to main entrypoint file
 * @param mapApiTagLevelToOutput - level oriented ApiTag to output file mapping
 * @param log - logger
 */
async function generateSourceEntrypoints(
	mainEntrypoint: string,
	mapApiTagLevelToOutput: Map<ApiTag, ExportData>,
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
			if (apiTagLevel !== "beta") {
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
				moduleSpecifier: `../${mainSourceFile
					.getBaseName()
					.replace(/\.(?:d\.)?([cm]?)ts$/, ".$1js")}`,
				namedExports,
				isTypeOnly: mapApiTagLevelToOutput.get(apiTagLevel)?.isTypeOnly,
			});
		} else {
			// At this point we already know that package "export" has a request
			// for this entrypoint. Warn of emptiness, but make it valid for use.
			log.warning(`no exports for ${outFile} using API level tag ${apiTagLevel}`);
			sourceFile.insertText(0, `${newFileHeader} export {};\n\n`);
		}

		fileSavePromises.push(sourceFile.save());
	}

	await Promise.all(fileSavePromises);
}
