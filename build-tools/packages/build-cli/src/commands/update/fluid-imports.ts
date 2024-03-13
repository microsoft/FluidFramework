/* eslint-disable max-depth */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { readFile } from "fs-extra";
import * as JSON5 from "json5";
import path from "node:path";
import { Project, type ImportDeclaration } from "ts-morph";
import { BaseCommand } from "../../base";

// These types are very similar to those defined and used in the `release setPackageTypesField` command, but that
// command is likely to be deprecated soon, so no effort has been made to unify them.
const publicLevel = "public";
const betaLevel = "beta";
const alphaLevel = "alpha";
const internalLevel = "internal";
const knownLevels = [publicLevel, betaLevel, alphaLevel, internalLevel] as const;
type ApiLevel = (typeof knownLevels)[number];

/**
 * Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.).
 */
export default class UpdateFluidImportsCommand extends BaseCommand<
	typeof UpdateFluidImportsCommand
> {
	static readonly description =
		`Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)`;

	static readonly flags = {
		tsconfig: Flags.file({
			description: "Path to a tsconfig file that will be used to load project files.",
			default: "./tsconfig.json",
			exists: true,
		}),
		data: Flags.file({
			description: "Path to a data file containing raw API level data.",
			exists: true,
		}),
		organize: Flags.boolean({
			description:
				"Organize the imports in any file that is modified. Note that this can make it more difficult to see the rewritten import changes.",
		}),
		onlyInternal: Flags.boolean({
			description: "Use /internal for all non-public APIs instead of /alpha or /beta.",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { tsconfig, data, onlyInternal, organize } = this.flags;
		const dataFilePath = data ?? path.join(__dirname, "../../../data/rawApiLevels.jsonc");
		const apiLevelData = await loadData(dataFilePath);
		await updateImports(tsconfig, apiLevelData, onlyInternal, organize, this.logger);
	}
}

/**
 * Returns the ApiLevel for an API based on provided data.
 */
function getApiLevelForImportName(
	name: string,
	data: MemberData,
	defaultValue: ApiLevel,
	onlyInternal: boolean,
): ApiLevel {
	if (data.alpha?.includes(name) === true) return onlyInternal ? "internal" : "alpha";
	if (data.beta?.includes(name) === true) return onlyInternal ? "internal" : "beta";
	if (data.public?.includes(name) === true) return "public";
	if (data.internal?.includes(name) === true) return "internal";
	return defaultValue;
}

async function updateImports(
	tsConfigFilePath: string,
	mappingData: MapData,
	onlyInternal: boolean,
	organizeImports: boolean,
	log?: Logger,
): Promise<void> {
	const project = new Project({
		tsConfigFilePath,
	});
	const sourceFiles = project
		.getSourceFiles()
		// Filter out type files - this may not be correct in projects with manually defined declarations.
		.filter((sourceFile) => sourceFile.getExtension() !== ".d.ts");

	// Iterate over each source file, looking for Fluid imports
	for (const sourceFile of sourceFiles) {
		log?.verbose(`Source file: ${sourceFile.getBaseName()}`);

		/**
		 * All of the import declarations. This is basically every `import foo from bar` statement in the file.
		 */
		const imports = sourceFile.getImportDeclarations();

		/**
		 * True if the sourceFile has changed.
		 */
		let sourceFileChanged = false;

		/**
		 * A mapping of new module specifier to named import. We'll populate this as we scan the existing imports, then
		 * write new remapped imports to the file.
		 */
		const newImports: Map<string, string[]> = new Map();

		// Collect the existing declarations
		for (const importDeclaration of imports) {
			const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
			if (
				moduleSpecifier.startsWith("@fluid") ||
				["fluid-framework", "tinylicious"].includes(moduleSpecifier)
			) {
				log?.verbose(`Found a fluid import: '${moduleSpecifier}'`);
				const modulePieces = moduleSpecifier.split("/");
				const moduleName = modulePieces.slice(0, 2).join("/");
				const subpath = modulePieces.length === 3 ? modulePieces[2] : "public";
				log?.verbose(`subpath: ${subpath}`);
				const data = mappingData.get(moduleName);

				if (data === undefined) {
					log?.verbose(`Skipping ${moduleSpecifier}`);
				} else {
					// TODO: Handle default import if needed.
					const defaultImport = importDeclaration.getDefaultImport();
					if (defaultImport !== undefined) {
						log?.warning(
							`Found a default import (not yet implemented): ${defaultImport
								.getText()
								.trim()}`,
						);
					}
					const namedImports = importDeclaration.getNamedImports();

					log?.info(`Iterating named imports...`);
					for (const importSpecifier of namedImports) {
						const alias = importSpecifier.getAliasNode();
						if (alias !== undefined) {
							log?.warning(`Found an alias (not yet implemented): ${alias.getText().trim()}`);
						}

						const name = importSpecifier.getName();
						// fullImportSpecifierText includes surrounding text like "type" and whitespace. The surrounding whitespace
						// is trimmed, but leading or trailing text like "type" or "as foo" is still included. This is the string
						// that will be used in the new imports.
						const fullImportSpecifierText = importSpecifier.getFullText().trim();
						const expectedLevel = getApiLevelForImportName(name, data, "public", onlyInternal);

						log?.verbose(
							`Found import named: '${fullImportSpecifierText}' (${expectedLevel})`,
						);
						const newSpecifier =
							expectedLevel === "public" ? moduleName : `${moduleName}/${expectedLevel}`;

						if (!newImports.has(newSpecifier)) {
							newImports.set(newSpecifier, []);
						}
						newImports.get(newSpecifier)?.push(fullImportSpecifierText);
					}

					// Delete this declaration; we've collected all the imports from it and will output them in new nodes later.
					// This does re-order code, but that seems like a fact of life here. The organize flag can be used to add some
					// determinism to the output.
					importDeclaration.remove();
					log?.info(`REMOVED import from ${moduleSpecifier}`);
				}
			}
		}

		for (const [newSpecifier, names] of newImports) {
			// Not sure this check is necessary.
			if (names.length > 0) {
				sourceFile.addImportDeclaration({
					namedImports: names,
					moduleSpecifier: newSpecifier,
				});
				sourceFileChanged = true;
			}
			log?.info(`ADDED import from ${newSpecifier}`);
		}

		if (sourceFileChanged && organizeImports) {
			log?.info(`Organized imports in: ${sourceFile.getBaseName()}`);
			sourceFile.organizeImports();
		}

		if (sourceFileChanged) {
			await sourceFile.save();
		}
	}

	// Don't save the project since we're saving source files one at a time instead
	// await project.save();
}

// This raw data comes from this ripgrep one-liner:
//
// rg -UPNo -g '**/api-report/*.api.md' --multiline-dotall --heading '\s*@(alpha|beta|public|internal).*?export\s*(\w*)\s(\w*).*?(?:\{|;)' -r '{ "level": "$1", "kind": "$2", "name": "$3" },'
//
// It's transformed into a more usable format in the code below.
interface MemberDataRaw {
	level: ApiLevel;
	kind: string;
	name: string;
}

type MemberData = Partial<Record<ApiLevel, string[]>>;
type MapData = Map<string, MemberData>;

function isKnownLevel(level: string): level is ApiLevel {
	return (knownLevels as readonly string[]).includes(level);
}

function ensureLevel(entry: MemberData, level: keyof MemberData): string[] {
	const entryData = entry[level];
	if (entryData !== undefined) {
		return entryData;
	}
	const newData: string[] = [];
	entry[level] = newData;
	return newData;
}

async function loadData(dataFile: string): Promise<MapData> {
	// Load the raw data file
	const rawData: string = (await readFile(dataFile)).toString();
	const apiLevelDataRaw: Record<string, MemberDataRaw[]> = JSON5.parse(rawData);

	// Transform the raw data into a more useable form
	const apiLevelData = new Map<string, MemberData>();
	for (const [moduleName, members] of Object.entries(apiLevelDataRaw)) {
		const entry = apiLevelData.get(moduleName) ?? {};
		for (const member of members) {
			const { level } = member;
			if (!isKnownLevel(level)) {
				throw new Error(`Unknown API level: ${level}`);
			}
			ensureLevel(entry, level).push(member.name);
		}
		apiLevelData.set(moduleName, entry);
	}
	return apiLevelData;
}
