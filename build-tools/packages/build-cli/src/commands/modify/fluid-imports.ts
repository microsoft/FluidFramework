/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-depth */

import { Flags } from "@oclif/core";
import { existsSync, readFile } from "fs-extra";
import * as JSON5 from "json5";
import path from "node:path";
import { Project, type ImportDeclaration, type SourceFile } from "ts-morph";
import { BaseCommand } from "../../base";
import type { CommandLogger } from "../../logging";

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

		if (!existsSync(tsconfig)) {
			this.error(`Can't find config file: ${tsconfig}`, { exit: 0 });
		}
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
	if (data.alpha?.includes(name) === true) return onlyInternal ? internalLevel : alphaLevel;
	if (data.beta?.includes(name) === true) return onlyInternal ? internalLevel : alphaLevel;
	if (data.public?.includes(name) === true) return publicLevel;
	if (data.internal?.includes(name) === true) return internalLevel;
	return defaultValue;
}

async function updateImports(
	tsConfigFilePath: string,
	mappingData: MapData,
	onlyInternal: boolean,
	organizeImports: boolean,
	log: CommandLogger,
): Promise<void> {
	const project = new Project({
		tsConfigFilePath,
	});
	const sourceFiles = project
		.getSourceFiles()
		// Filter out type files - this may not be correct in projects with manually defined declarations.
		.filter((sourceFile) => sourceFile.getExtension() !== ".d.ts");

	/**
	 * List of source file save promises. Used to collect modified source file save promises so we can await them all at
	 * once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	// Iterate over each source file, looking for Fluid imports
	for (const sourceFile of sourceFiles) {
		log.verbose(`Source file: ${sourceFile.getBaseName()}`);

		// Delete any header comments at the beginning of the file. Save the text so we can re-insert it at the end of
		// processing. Note that this does modify the source file, but we only save changes if the imports are updated, so
		// the removal will not be persisted unless there are import changes. In that case we re-add the header before we
		// save. Therefore it's safe to remove the header here even before we know if we need to write the file.
		const headerText = removeFileHeaderComment(sourceFile);

		/**
		 * All of the import declarations. This is basically every `import foo from bar` statement in the file.
		 */
		const imports = sourceFile.getImportDeclarations();

		// Skip source files with no imports.
		if (imports.length === 0) {
			continue;
		}

		/**
		 * True if the sourceFile has changed.
		 */
		let sourceFileChanged = false;

		/**
		 * We'll populate the maps defined below this as we scan the existing imports, then write new remapped imports to
		 * the file.
		 */

		/**
		 * A mapping of new module specifier to named import. This map only contains "regular" imports; that it, it excludes
		 * type-only imports.
		 */
		const newRegularImports: Map<string, Set<string>> = new Map();

		/**
		 * A mapping of new module specifier to named import. This map only contains type-only imports.
		 */
		const newTypeOnlyImports: Map<string, Set<string>> = new Map();

		// FIRST PASS: collect the existing declarations
		for (const importDeclaration of imports) {
			// Skip non-Fluid imports
			if (!isFluidImport(importDeclaration)) {
				continue;
			}
			const [moduleName] = parseImport(importDeclaration);
			const data = mappingData.get(moduleName);

			// Skip modules with no mapping
			if (data === undefined) {
				log.verbose(
					`Skipping (no entry in data file): ${importDeclaration.getModuleSpecifierValue()}`,
				);
			} else {
				// TODO: Handle default import.
				const defaultImport = importDeclaration.getDefaultImport();
				if (defaultImport !== undefined) {
					log.warning(
						`Found a default import (not yet implemented): ${defaultImport.getText().trim()}`,
					);
					continue;
				}
				const namedImports = importDeclaration.getNamedImports();
				const isTypeOnly = importDeclaration.isTypeOnly();

				log.logIndent(`Iterating named imports...`, 2);
				for (const importSpecifier of namedImports) {
					const name = importSpecifier.getName();

					/**
					 * fullImportSpecifierText includes surrounding text like "type" and whitespace. The surrounding whitespace is
					 * trimmed, but leading or trailing text like "type" or "as foo" (an alias) is still included. This is the
					 * string that will be used in the new imports.
					 *
					 * This ensures aliases and individual type-only imports are maintained when rewritten.
					 */
					const fullImportSpecifierText = importSpecifier.getFullText().trim();
					const expectedLevel = getApiLevelForImportName(
						name,
						data,
						/* default */ publicLevel,
						onlyInternal,
					);

					log.logIndent(
						`Found import named: '${fullImportSpecifierText}' (${expectedLevel})`,
						4,
					);
					const newSpecifier =
						expectedLevel === publicLevel ? moduleName : `${moduleName}/${expectedLevel}`;

					// Track the type-only and regular imports separately. In the second pass through the imports, we'll
					// create new type-only imports for the ones that were originally type-only. Using separate lists is a little
					// more verbose but easier to reason about.
					if (isTypeOnly) {
						if (!newTypeOnlyImports.has(newSpecifier)) {
							newTypeOnlyImports.set(newSpecifier, new Set());
						}
						newTypeOnlyImports.get(newSpecifier)?.add(fullImportSpecifierText);
					} else {
						if (!newRegularImports.has(newSpecifier)) {
							newRegularImports.set(newSpecifier, new Set());
						}
						newRegularImports.get(newSpecifier)?.add(fullImportSpecifierText);
					}
				}
			}
		} /* FIRST PASS */

		// SECOND PASS: Update existing imports and add any missing ones
		for (const importDeclaration of imports) {
			// Skip non-Fluid imports
			if (!isFluidImport(importDeclaration)) {
				continue;
			}

			const [moduleName] = parseImport(importDeclaration);
			const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
			const isTypeOnly = importDeclaration.isTypeOnly();

			// Skip Fluid imports that aren't in the data file
			if (!mappingData.has(moduleName)) {
				continue;
			}

			// Check if there are supposed to be any new imports from the module specifier
			const newImportNames = isTypeOnly
				? newTypeOnlyImports.get(moduleSpecifier)
				: newRegularImports.get(moduleSpecifier);

			// Since there are no imports from this module specifier, remove it.
			if (newImportNames === undefined) {
				importDeclaration.remove();
				sourceFileChanged = true;
				continue;
			}

			// There are new named imports for this module specifier, so remove all individual named imports and immediately
			// add the new ones.
			if (newImportNames.size > 0) {
				importDeclaration.removeNamedImports();
				importDeclaration.addNamedImports([...newImportNames]);
				// We need to set this because we completely removed the declaration earlier, so this is effectively now a new declaration
				importDeclaration.setIsTypeOnly(isTypeOnly);
				// Need to clear the list of new named imports since we just added them.
				newImportNames.clear();
				sourceFileChanged = true;
			}
		} /* SECOND PASS */

		// Add any imports from a specifier that wasn't already in the file
		for (const [importSpecifier, newImportNames] of newRegularImports) {
			if (newImportNames.size > 0) {
				sourceFile.addImportDeclaration({
					moduleSpecifier: importSpecifier,
					namedImports: [...newImportNames],
				});
				sourceFileChanged = true;
			}
		}
		for (const [importSpecifier, newImportNames] of newTypeOnlyImports) {
			if (newImportNames.size > 0) {
				sourceFile.addImportDeclaration({
					moduleSpecifier: importSpecifier,
					namedImports: [...newImportNames],
					isTypeOnly: true,
				});
				sourceFileChanged = true;
			}
		}

		if (sourceFileChanged) {
			// Manually re-insert the header at the top of the file
			sourceFile.insertText(0, headerText);

			if (organizeImports) {
				log.info(`Organized imports in: ${sourceFile.getBaseName()}`);
				sourceFile.organizeImports();
			}

			fileSavePromises.push(sourceFile.save());
		}
	}

	// We don't want to save the project since we may have made temporary edits to some source files.
	// Instead, we save files individually.
	await Promise.all(fileSavePromises);
}

/**
 * Parses an import declaration into its module specifier and subpath.
 *
 * @param importDeclaration - the import declaration to check.
 * @returns a tuple of `[module specifier, subpath]`
 */
function parseImport(importDeclaration: ImportDeclaration): [string, string] {
	const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
	const modulePieces = moduleSpecifier.split("/");
	const moduleName = modulePieces.slice(0, 2).join("/");
	const subpath = modulePieces.length === 3 ? modulePieces[2] : "public";
	return [moduleName, subpath];
}

function isFluidImport(importDeclaration: ImportDeclaration): boolean {
	const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
	return (
		moduleSpecifier.startsWith("@fluid") ||
		["fluid-framework", "tinylicious"].includes(moduleSpecifier)
	);
}

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
	// eslint-disable-next-line unicorn/no-await-expression-member
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

/**
 * Delete any header comments at the beginning of the file. Return the removed text.
 */
function removeFileHeaderComment(sourceFile: SourceFile): string {
	const firstNode = sourceFile.getChildAtIndex(0);

	// Joins the comment ranges with double new lines so there is an empty line between each comment. This does mean that
	// the ranges may be output in a slightly different way than it was ingested. However, there does not appear to be a
	// way to get the text of multiple ranges, so the spacing information between the nodes seems to be lost.
	//
	// This has to be done before the sourceFile is modified, because after that the comment ranges become invalid and
	// ts-morph throws an exception.
	const headerComments = firstNode.getLeadingCommentRanges();
	const headerText = `${headerComments.map((comment) => comment.getText()).join("\n\n")}\n\n`;
	const [start, end] = [firstNode.getPos(), firstNode.getEnd()];
	sourceFile.replaceText([start, end], sourceFile.getChildAtIndex(0).getText());
	return headerText;
}
