/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";

import type { PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { ExportSpecifierStructure, Node } from "ts-morph";
import { ModuleKind, Project, ScriptKind } from "ts-morph";

import type { CommandLogger } from "../../logging.js";
import { BaseCommand } from "./base.js";

import { ApiLevel } from "../apiLevel.js";
import { ApiTag } from "../apiTag.js";
import type { ExportData } from "../packageExports.js";
import { queryDefaultResolutionPathsFromPackageExports } from "../packageExports.js";
import { getApiExports, getPackageDocumentationText } from "../typescriptApi.js";

import type { TsConfigJson } from "type-fest";

const optionDefaults = {
	mainEntrypoint: "./src/index.ts",
	outFileAlpha: ApiLevel.alpha,
	outFileBeta: ApiLevel.beta,
	outFileLegacy: ApiLevel.legacy,
	outFilePublic: ApiLevel.public,
	outFileSuffix: ".ts",
	srcDir: "src/",
} as const;

/**
 * Generates type declarations files for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export class GenerateSourceEntrypointsCommand extends BaseCommand<
	typeof GenerateSourceEntrypointsCommand
> {
	static readonly description =
		`Generates type declaration entrypoints for Fluid Framework API levels (/alpha, /beta. etc.) as found in package.json "exports"`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: optionDefaults.mainEntrypoint,
			exists: true,
		}),
		outFileAlpha: Flags.string({
			description: "Base file name for alpha entrypoint declaration files.",
			default: optionDefaults.outFileAlpha,
		}),
		outFileBeta: Flags.string({
			description: "Base file name for beta entrypoint declaration files.",
			default: optionDefaults.outFileBeta,
		}),
		outFileLegacy: Flags.string({
			description: "Base file name for legacy entrypoint declaration files.",
			default: optionDefaults.outFileLegacy,
		}),
		outFilePublic: Flags.string({
			description: "Base file name for public entrypoint declaration files.",
			default: optionDefaults.outFilePublic,
		}),
		outFileSuffix: Flags.string({
			description:
				"File name suffix including extension for emitting entrypoint declaration files.",
			default: optionDefaults.outFileSuffix,
		}),
		srcDir: Flags.string({
			description: "Directory to emit source entrypoint declaration files.",
			default: optionDefaults.srcDir,
			exists: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint } = this.flags;

		const packageJson = await readPackageJson();

		const tsConfig = await readTsConfig();

		const { mapQueryPathToApiTagLevel, mapApiTagLevelToOutput } = getOutputConfiguration(
			this.flags,
			packageJson,
			tsConfig,
			this.logger,
		);

		if (mapApiTagLevelToOutput.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapQueryPathToApiTagLevel.keys(),
				].join("\n\t")}`,
			);
		}

		const promises: Promise<void>[] = [];

		// In the past @alpha APIs could be mapped to /legacy via --outFileAlpha.
		// When @alpha is mapped to /legacy, @beta should not be included in
		// @alpha aka /legacy entrypoint.
		const separateBetaFromAlpha = this.flags.outFileAlpha !== ApiLevel.alpha;
		promises.push(
			generateSourceEntrypoints(
				mainEntrypoint,
				mapApiTagLevelToOutput,
				this.logger,
				separateBetaFromAlpha,
			),
		);

		// All of the output actions (deletes of stale files or writing of new/updated files)
		// are all independent and can be done in parallel.
		await Promise.all(promises);
	}
}

async function readPackageJson(): Promise<PackageJson> {
	const packageJson = await fs.readFile("./package.json", { encoding: "utf8" });
	return JSON.parse(packageJson) as PackageJson;
}

async function readTsConfig(): Promise<TsConfigJson> {
	const tsConfigContent = await fs.readFile("./tsconfig.json", { encoding: "utf8" });
	// Trim content to avoid unexpected whitespace issues
	const trimmedContent = tsConfigContent.trim();

	// Remove trailing commas before parsing
	const sanitizedContent = trimmedContent.replace(/,\s*([\]}])/g, "$1");

	// Parse and validate JSON content
	return JSON.parse(sanitizedContent) as TsConfigJson;
}

function getOutputConfiguration(
	flags: Readonly<Record<keyof typeof optionDefaults, string>>,
	packageJson: PackageJson,
	tsconfig: TsConfigJson,
	logger?: CommandLogger,
): {
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>;
	mapApiTagLevelToOutput: Map<ApiTag, ExportData>;
} {
	const { outFileSuffix, outFileAlpha, outFileBeta, outFileLegacy, outFilePublic, srcDir } =
		flags;

	const mapQuerySrcPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined> = new Map([
		[`${srcDir}${outFileAlpha}${outFileSuffix}`, ApiTag.alpha],
		[`${srcDir}${outFileBeta}${outFileSuffix}`, ApiTag.beta],
		[`${srcDir}${outFilePublic}${outFileSuffix}`, ApiTag.public],
	]);

	// In the past @alpha APIs could be mapped to /legacy via --outFileAlpha.
	// If @alpha is not mapped to same as @legacy, then @legacy can be mapped.
	if (outFileAlpha !== outFileLegacy) {
		mapQuerySrcPathToApiTagLevel.set(
			`${srcDir}${outFileLegacy}${outFileSuffix}`,
			ApiTag.legacy,
		);
	}

	let emitDeclarationOnly: boolean = false;
	if (tsconfig.compilerOptions?.emitDeclarationOnly !== undefined) {
		emitDeclarationOnly = tsconfig.compilerOptions.emitDeclarationOnly;
	}

	const { mapKeyToOutput: mapSrcApiTagLevelToOutput } =
		queryDefaultResolutionPathsFromPackageExports(
			packageJson,
			mapQuerySrcPathToApiTagLevel,
			emitDeclarationOnly,
			logger,
		);

	return {
		mapQueryPathToApiTagLevel: mapQuerySrcPathToApiTagLevel,
		mapApiTagLevelToOutput: mapSrcApiTagLevelToOutput,
	};
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
 * Generated by "flub generate source-entrypoints" in @fluid-tools/build-cli.
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
async function generateSourceEntrypoints(
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
