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
import { ApiLevel, getApiExports } from "../../library";
import type { CommandLogger } from "../../logging";

/**
 * Literal pattern to search for in file prefix to replace with unscoped package name.
 *
 * @privateRemarks api-extractor use `<@..>`, but `<>` is problematic for command line
 * specification. A policy incorrectly thinks an argument like that should not be quoted.
 * It is just easier to use an alternate bracket style.
 */
const unscopedPackageNameString = "{@unscopedPackageName}";

/**
 * Generates type declarations files for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateEntrypointsCommand extends BaseCommand<
	typeof GenerateEntrypointsCommand
> {
	static readonly description =
		`Generates type declaration entrypoints for Fluid Framework API levels (/alpha, /beta. etc.)`;

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
		outFilePrefix: Flags.string({
			description: `File name prefix for emitting entrypoint declaration files. Pattern of '${unscopedPackageNameString}' within value will be replaced with the unscoped name of this package.`,
			default: "",
		}),
		outFileSuffix: Flags.string({
			description:
				"File name suffix including extension for emitting entrypoint declaration files.",
			default: ".d.ts",
		}),
		node10Compat: Flags.boolean({
			description: `Optional generation of Node10 resolution compatible entrypoints matching those in package "exports" aligned with "main".`,
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
			node10Compat,
		} = this.flags;

		let pkgJsonPromise: Promise<PackageJson> | undefined;
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		function getPackageJsonPromise(): Promise<PackageJson> {
			pkgJsonPromise = pkgJsonPromise ?? readPackageJson();
			return pkgJsonPromise;
		}

		await generateEntrypoints(
			mainEntrypoint,
			{
				pathPrefix: await getOutPathPrefix(this.flags, getPackageJsonPromise),
				pathSuffix: outFileSuffix,
			},
			(level: Exclude<ApiLevel, typeof ApiLevel.internal>): string => {
				switch (level) {
					case ApiLevel.alpha: {
						return outFileAlpha;
					}
					case ApiLevel.beta: {
						return outFileBeta;
					}
					case ApiLevel.public: {
						return outFilePublic;
					}
					default: {
						this.error(`Unexpected ApiLevel value: ${level}`, { exit: 1 });
					}
				}
			},
			this.logger,
		);

		// Node10 Compat must follow generateEntryPoints as files generated then
		// may be checked during Node10 compat generation.
		if (node10Compat) {
			await generateNode10Entrypoints(getPackageJsonPromise(), this.logger);
		}
	}
}

async function readPackageJson(): Promise<PackageJson> {
	const packageJson = await fs.readFile("./package.json", { encoding: "utf8" });
	return JSON.parse(packageJson) as PackageJson;
}

async function getOutPathPrefix(
	{ outDir, outFilePrefix }: { outDir: string; outFilePrefix: string },
	getPackageJsonPromise: () => Promise<PackageJson>,
): Promise<string> {
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
					await getLocalUnscopedPackageName(getPackageJsonPromise),
				)
			: outFilePrefix,
	);
}

async function getLocalUnscopedPackageName(
	getPackageJsonPromise: () => Promise<PackageJson>,
): Promise<string> {
	const packageJson = await getPackageJsonPromise();
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
	{ pathPrefix, pathSuffix }: { pathPrefix: string; pathSuffix: string },
	getApiLevelDisplayName: (level: Exclude<ApiLevel, typeof ApiLevel.internal>) => string,
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
		compilerOptions: { module: ModuleKind.Node16 },
	});
	const mainSourceFile = project.addSourceFileAtPath(mainEntrypoint);
	const exports = getApiExports(mainSourceFile);

	// This order is critical as public should include beta should include alpha.
	const apiLevels: readonly Exclude<ApiLevel, typeof ApiLevel.internal>[] = [
		ApiLevel.public,
		ApiLevel.beta,
		ApiLevel.alpha,
	] as const;
	const namedExports: Omit<ExportSpecifierStructure, "kind">[] = [];

	if (exports.unknown.size > 0) {
		log.errorLog(
			`${exports.unknown.size} export(s) found without a recognized API level:\n\t${[
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

	for (const apiLevel of apiLevels) {
		// Append this levels additional (or only) exports sorted by ascending case-sensitive name
		const orgLength = namedExports.length;
		const levelExports = [...exports[apiLevel]].sort((a, b) => (a.name > b.name ? 1 : -1));
		for (const levelExport of levelExports) {
			namedExports.push({ ...levelExport, leadingTrivia: "\n\t" });
		}
		if (namedExports.length > orgLength) {
			namedExports[orgLength].leadingTrivia = `\n\t// ${apiLevel} APIs\n\t`;
			namedExports[namedExports.length - 1].trailingTrivia = "\n";
		}

		const outFile = `${pathPrefix}${getApiLevelDisplayName(apiLevel)}${pathSuffix}`;
		log.info(`\tGenerating ${outFile}`);
		const sourceFile = project.createSourceFile(outFile, undefined, {
			overwrite: true,
			scriptKind: ScriptKind.TS,
		});

		sourceFile.insertText(0, generatedHeader);
		// Avoid adding export declaration unless there are exports.
		// Adding one without any named exports results in a * export (everything).
		if (namedExports.length > 0) {
			sourceFile.addExportDeclaration({
				moduleSpecifier: `./${mainSourceFile
					.getBaseName()
					.replace(/\.(?:d\.)?([cm]?)ts$/, ".$1js")}`,
				namedExports,
			});
		} else {
			// Without any export this module is invalid.
			// This is somewhat useful while standing up FF to recognize invalid/unused
			// cases that should not be exported. In the future for deprecation support
			// this could generate an empty export block when package.json lists this
			// path.
			// It is also good to generate a file versus not to avoid leaving stale
			// files around. If avoiding generation in the future, then file existence
			// should be checked and the file removed.
		}

		fileSavePromises.push(sourceFile.save());
	}

	await Promise.all(fileSavePromises);
}

/**
 * Only the value types of exports that are records, with addition of optional "types" property that
 * type-fest omits.
 */
type ExportsRecordValue = Exclude<Extract<PackageJson["exports"], object>, unknown[]> & {
	types?: string;
};

function findTypesPathForReferencedExportPath(
	resolvedPath: string,
	exports: ExportsRecordValue,
): string | undefined {
	for (const value of Object.values(exports)) {
		if (typeof value === "string") {
			const resolvedValuePath = path.resolve(value);
			if (resolvedValuePath === resolvedPath) {
				// matching path has been found - lookup sibling "types" value
				return exports.types;
			}
		} else if (value !== null) {
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathForReferencedExportPath(resolvedPath, value);
			if (deepFind !== undefined) {
				return deepFind;
			}
		}
	}

	return undefined;
}

function findTypesPathUnder(
	resolvedDirectoryPath: string,
	exports: ExportsRecordValue,
): string | undefined {
	for (const [entry, value] of Object.entries(exports)) {
		if (typeof value === "string") {
			if (entry === "types") {
				const resolvedValuePath = path.resolve(value);
				if (resolvedValuePath.startsWith(resolvedDirectoryPath)) {
					return value;
				}
			}
		} else if (value !== null) {
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathUnder(resolvedDirectoryPath, value);
			if (deepFind !== undefined) {
				return deepFind;
			}
		}
	}

	return undefined;
}

/**
 * Creates and saves file with given content with expectation that it
 * references specified file and that file is valid module.
 *
 * @param referenceFile - file that must ultimately exist as valid module
 * @param outFile - path of file to create
 * @param content - text content for the outFile
 * @param log - logger
 * @returns - Promise of completed file save
 */
async function createRedirectFile(
	referenceFile: string,
	outFile: string,
	content: string,
	log: CommandLogger,
): Promise<void> {
	// Check that referenced file might be valid - it must contain the string "export".
	const importContent = await fs.readFile(referenceFile, { encoding: "utf8" });
	if (!importContent.includes("export")) {
		// It is not valid, therefore outFile should not exist.
		await fs.rm(outFile, { force: true }).finally(() => {
			throw new Error(
				`${referenceFile} does not appear to be a valid module (does not contain "export")`,
			);
		});
	}

	log.info(`\tGenerating ${outFile}`);
	return fs.writeFile(outFile, content, "utf8");
}

async function generateNode10Entrypoints(
	pkgJsonPromise: Promise<PackageJson>,
	log: CommandLogger,
): Promise<void> {
	const pkgJson = await pkgJsonPromise;
	const mainEntrypoint = pkgJson.main;
	const typesEntrypoint = pkgJson.types;
	if (typeof mainEntrypoint !== "string") {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error('no valid "main" string within package properties');
	}
	if (typeof typesEntrypoint !== "string") {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error('no valid "types" string within package properties');
	}

	if (!mainEntrypoint && !typesEntrypoint) {
		// This is valid case for a package that does not yet have a public API.
		// To generate proper compat, some reference path is needed. That could
		// be the main entrypoint like ./lib/index.js or type ./lib.index.d.ts.
		// Something needs to establish that support ins't being requested for
		// another path like ./dist/index.js.
		throw new Error(
			'Node10 compatible entrypoints will not be generated when "main" and "types" are empty',
		);
	}

	const { exports } = pkgJson;
	if (typeof exports !== "object" || exports === null) {
		throw new Error('no valid "exports" within package properties');
	}

	if (Array.isArray(exports)) {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(`Node10 compatible entrypoints cannot be generated for "exports" array`);
	}

	/**
	 * List of out file save promises. Used to collect generated file save
	 * promises so we can await them all at once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	// Use a resolved path because some entries my use ./ prefix and others not.
	const mainEntrypointPath = mainEntrypoint ? path.resolve(mainEntrypoint) : "";
	const typesEntrypointDirectoryPath = typesEntrypoint
		? path.dirname(path.resolve(typesEntrypoint))
		: "";

	// Iterate through exports looking for properties with values matching main entrypoint.
	for (const [exportPath, exportValue] of Object.entries(exports)) {
		if (exportPath === ".") {
			continue;
		}
		if (typeof exportValue !== "object") {
			log.verbose(
				`Node10 compat: ignoring non-object export path "${exportPath}": "${exportValue}"`,
			);
			continue;
		}
		if (exportValue === null) {
			log.verbose(`Node10 compat: ignoring null export path "${exportPath}"`);
			continue;
		}
		if (Array.isArray(exportValue)) {
			log.verbose(`Node10 compat: ignoring array export path "${exportPath}"`);
			continue;
		}

		const outFile = `${exportPath}.d.ts`;
		if (mainEntrypointPath) {
			const findResult = findTypesPathForReferencedExportPath(mainEntrypointPath, exportValue);
			if (findResult !== undefined) {
				const importFrom = findResult.replace(/\.d\.([cm]?)ts/, ".$1js");
				fileSavePromises.push(
					createRedirectFile(
						findResult,
						outFile,
						`${generatedHeader}\nexport * from "${importFrom}";\n`,
						log,
					),
				);
			}
		} else {
			const findResult = findTypesPathUnder(typesEntrypointDirectoryPath, exportValue);
			if (findResult !== undefined) {
				fileSavePromises.push(
					createRedirectFile(
						findResult,
						outFile,
						`${generatedHeader}\nexport type * from "${findResult}";\n`,
						log,
					),
				);
			}
		}
	}

	if (fileSavePromises.length === 0) {
		log.info(`\tNo Node10 compat files generated.`);
	}

	await Promise.all(fileSavePromises);
}
