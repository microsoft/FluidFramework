/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-array-callback-reference */

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
// Note: this is sorted by the preferred order that respective imports would exist.
// public is effectively "" for sorting purposes and then arranged alphabetically
// as most formatters would prefer.
const knownLevels = [publicLevel, alphaLevel, betaLevel, internalLevel] as const;
type ApiLevel = (typeof knownLevels)[number];

/**
 * FF packages that exist outside of a scope that starts with `@fluid`.
 */
const unscopedFFPackages = new Set(["fluid-framework", "tinylicious"]);

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
		onlyInternal: Flags.boolean({
			description: "Use /internal for all non-public APIs instead of /alpha or /beta.",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { tsconfig, data, onlyInternal } = this.flags;

		if (!existsSync(tsconfig)) {
			this.error(`Can't find config file: ${tsconfig}`, { exit: 0 });
		}
		const dataFilePath = data ?? path.join(__dirname, "../../../data/rawApiLevels.jsonc");
		const apiLevelData = await loadData(dataFilePath);
		await updateImports(tsconfig, apiLevelData, onlyInternal, this.logger);
	}
}

interface FluidImportDataBase {
	index: number;
	packageName: string;
	level: ApiLevel;
	/**
	 * package relative ordinal for levels (alphabetically) ("public" is really "" so first)
	 * and type-only before not.
	 */
	order: number;
	/**
	 * structured to match ts-morph ImportDeclarationStructure
	 */
	declaration: {
		isTypeOnly: boolean;
		moduleSpecifier: string;
		/**
		 * additions only
		 */
		namedImports: string[];
	};
}
interface FluidImportDataPresent extends FluidImportDataBase {
	importDeclaration: ImportDeclaration;
	originallyUnassigned: boolean;
}
interface FluidImportDataPending extends FluidImportDataBase {
	/**
	 * when true, should be inserted after the index stored.
	 */
	insertAfterIndex: boolean;
}
type FluidImportData = FluidImportDataPresent | FluidImportDataPending;

class FluidImportManager {
	private readonly fluidImports: FluidImportDataPresent[];
	private readonly missingImports: FluidImportDataPending[] = [];

	constructor(
		private readonly sourceFile: SourceFile,
		private readonly mappingData: MapData,
		private readonly log: CommandLogger,
	) {
		this.fluidImports = parseFluidImports(sourceFile, log);
	}

	public process(onlyInternal: boolean): boolean {
		if (this.fluidImports.length === 0) {
			return false;
		}

		let modificationsRequired = false;

		// Collect the existing declarations
		for (const { importDeclaration, packageName, level } of this.fluidImports) {
			const data = this.mappingData.get(packageName);

			// Skip modules with no mapping
			if (data === undefined) {
				this.log.verbose(
					`Skipping (no entry in data file): ${importDeclaration.getModuleSpecifierValue()}`,
				);
				continue;
			}

			const namedImports = importDeclaration.getNamedImports();
			const isTypeOnly = importDeclaration.isTypeOnly();

			this.log.logIndent(`Iterating named imports...`, 2);
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

				this.log.logIndent(
					`Found import named: '${fullImportSpecifierText}' (${expectedLevel})`,
					4,
				);

				const properImport = this.ensureFluidImport({
					packageName,
					level: expectedLevel,
					isTypeOnly,
				});

				if (level !== expectedLevel) {
					modificationsRequired = true;
					importSpecifier.remove();
					properImport.declaration.namedImports.push(fullImportSpecifierText);
				}
			}
		} /* Collection */

		if (!modificationsRequired) return false;

		// Make modifications to existing imports
		for (const fluidImport of this.fluidImports) {
			// 1. add new import
			if (fluidImport.declaration.namedImports.length > 0) {
				fluidImport.importDeclaration.addNamedImports(fluidImport.declaration.namedImports);
			}
			//  2. or if not see if there are new imports that would like to take over
			//     which helps preserve comments and vertical spacing.
			else if (
				!fluidImport.originallyUnassigned &&
				isImportUnassigned(fluidImport.importDeclaration)
			) {
				const takeOverProspects = this.missingImports
					.filter((v) => v.index === fluidImport.index)
					.sort((a, b) => b.order - a.order);
				if (takeOverProspects.length > 0) {
					const replacement = takeOverProspects[0];
					this.log.verbose(
						`\tReplacing ${fluidImport.declaration.moduleSpecifier} with ${replacement.declaration.moduleSpecifier}`,
					);
					fluidImport.importDeclaration.setModuleSpecifier(
						replacement.declaration.moduleSpecifier,
					);
					fluidImport.importDeclaration.addNamedImports(replacement.declaration.namedImports);
					fluidImport.importDeclaration.setIsTypeOnly(replacement.declaration.isTypeOnly);
					// Any other prospects should be inserted after this now.
					for (const otherProspects of takeOverProspects.slice(1)) {
						otherProspects.insertAfterIndex = true;
					}
					// Remove the missing as it is now in place.
					this.missingImports.splice(this.missingImports.indexOf(replacement), 1);
					// We could remove the existing entry now, but that would
					// alter the array being iterated. No further meaningful use is expected.
					// The later removal check will skip as it now has imports.
					// Set originallyUnassigned as an ounce of precaution.
					fluidImport.originallyUnassigned = true;
				}
			}
		}

		const reverseSortedAdditions = this.missingImports.sort((a, b) => {
			const indexDelta = b.index - a.index;
			if (indexDelta) return indexDelta;
			return b.order - a.order;
		});
		for (const addition of reverseSortedAdditions) {
			// Note that ts-morph will not preserve blank lines that may have existed
			// near the insertion point.
			// When inserting before it is likely desirable to capture any for the
			// leading trivia (comments included) and "move" them to the inserted
			// import. Likewise for inserting after the leading trivia of the next
			// import should be moved to the trailing trivia of the inserted.
			// ts-morph has some fairly unexpected results with manipulations so
			// some trial and error may be required to get desired behavior.
			this.log.verbose(
				`\tInjecting ${addition.declaration.moduleSpecifier} ${
					addition.insertAfterIndex ? "after" : "before"
				} ${this.sourceFile
					.getImportDeclarations()
					[addition.index].getModuleSpecifierValue()}`,
			);
			this.sourceFile.insertImportDeclaration(
				addition.index + (addition.insertAfterIndex ? 1 : 0),
				addition.declaration,
			);
		}

		// Check for import that has no imports, default or named, that has been
		// modified. And only after insertions have been taken care of.
		for (const { importDeclaration, originallyUnassigned } of this.fluidImports) {
			if (!originallyUnassigned && isImportUnassigned(importDeclaration)) {
				importDeclaration.remove();
			}
		}

		return true;
	}

	/**
	 * Gets existing or creates new {@link FluidImportData} for given package,
	 * level, and type-sense.
	 *
	 * When there isn't an existing {@link ImportDeclaration}, a pending object
	 * is added to build up needed imports.
	 *
	 * @returns The {@link FluidImportData} for import case
	 */
	private ensureFluidImport({
		packageName,
		level,
		isTypeOnly,
	}: {
		packageName: string;
		level: ApiLevel;
		isTypeOnly: boolean;
	}): FluidImportData {
		const match = (element: FluidImportData): boolean =>
			element.packageName === packageName &&
			element.level === level &&
			element.declaration.isTypeOnly === isTypeOnly;

		const preexisting = this.fluidImports.find(match);
		if (preexisting !== undefined) {
			return preexisting;
		}

		// Check for a pending import
		const existing = this.missingImports.find(match);
		if (existing !== undefined) {
			return existing;
		}

		const moduleSpecifier = level === publicLevel ? packageName : `${packageName}/${level}`;
		// Order imports primarily by level then secondarily: type, untyped
		const order = knownLevels.indexOf(level) * 2 + (isTypeOnly ? 0 : 1);
		const { index, after } = this.findInsertionPoint(packageName, order);
		const newFluidImport: FluidImportDataPending = {
			declaration: {
				isTypeOnly,
				moduleSpecifier,
				namedImports: [],
			},
			index,
			packageName,
			level,
			order,
			insertAfterIndex: after,
		};
		this.missingImports.push(newFluidImport);

		return newFluidImport;
	}

	private findInsertionPoint(
		packageName: string,
		order: number,
	): { index: number; after: boolean } {
		const references = this.fluidImports.filter((v) => v.packageName === packageName);
		if (references.length === 1) {
			const ref = references[0];
			return {
				index: ref.index,
				after: order > ref.order,
			};
		}
		references.sort((a, b) => b.order - a.order);
		for (const ref of references) {
			if (order > ref.order) {
				return { index: ref.index, after: true };
			}
		}
		return { index: references[0].index, after: false };
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

		const importManager = new FluidImportManager(sourceFile, mappingData, log);
		if (importManager.process(onlyInternal)) {
			// Manually re-insert the header at the top of the file
			sourceFile.insertText(0, headerText);

			fileSavePromises.push(sourceFile.save());
		}
	}

	// We don't want to save the project since we may have made temporary edits to some source files.
	// Instead, we save files individually.
	await Promise.all(fileSavePromises);
}

/**
 * Parses an import declaration for processing as a Fluid Framework basic import.
 * Non-FF and complex imports are ignored (returns undefined).
 *
 * @param importDeclaration - the import declaration to check.
 * @param index - the current index of import block array.
 * @param log - logger.
 * @returns a {@link FluidImportDataPresent} metadata object
 */
function parseImport(
	importDeclaration: ImportDeclaration,
	index: number,
	log: CommandLogger,
): FluidImportDataPresent | undefined {
	const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
	const modulePieces = moduleSpecifier.split("/");
	const levelIndex = moduleSpecifier.startsWith("@") ? 2 : 1;
	const packageName = modulePieces.slice(0, levelIndex).join("/");
	const level = modulePieces.length > levelIndex ? modulePieces[levelIndex] : "public";
	if (!isKnownLevel(level)) {
		return undefined;
	}
	// Check for complicated path - beyond basic leveled import
	if (modulePieces.length > levelIndex + 1) {
		return undefined;
	}
	// Check for Fluid import
	if (!isFluidImport(packageName)) {
		return undefined;
	}
	// Check namespace imports which are checked trivially for API level use.
	if (importDeclaration.getNamespaceImport() !== undefined) {
		log.verbose(`\tSkipping namespace import of ${moduleSpecifier}`);
		return undefined;
	}

	const order = knownLevels.indexOf(level) * 2 + (importDeclaration.isTypeOnly() ? 0 : 1);
	return {
		importDeclaration,
		declaration: {
			isTypeOnly: importDeclaration.isTypeOnly(),
			moduleSpecifier,
			namedImports: [],
		},
		index,
		packageName,
		level,
		order,
		originallyUnassigned: isImportUnassigned(importDeclaration),
	};
}

/**
 * Parses a source file for basic static Fluid Framework imports.
 * Non-FF and complex imports are excluded.
 *
 * @param sourceFile - the ${@link SourceFile} to parse.
 * @param log - logger.
 * @returns an array of {@link FluidImportDataPresent} metadata objects
 */
function parseFluidImports(
	sourceFile: SourceFile,
	log: CommandLogger,
): FluidImportDataPresent[] {
	return sourceFile
		.getImportDeclarations()
		.map((importDecl, index) => parseImport(importDecl, index, log))
		.filter(
			(v) => v !== undefined,
		) /* no undefined elements remain */ as FluidImportDataPresent[];
}

function isFluidImport(packageName: string): boolean {
	return packageName.startsWith("@fluid") || unscopedFFPackages.has(packageName);
}

function isImportUnassigned(importDeclaration: ImportDeclaration): boolean {
	return (
		importDeclaration.getNamedImports().length === 0 &&
		importDeclaration.getDefaultImport() === undefined &&
		importDeclaration.getNamespaceImport() === undefined
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
	const start = sourceFile.getPos(); // should be 0
	const end = start + sourceFile.getLeadingTriviaWidth();

	// This has to be done before the sourceFile is modified, because after that the ranges
	// become invalid and ts-morph throws an exception.
	const headerText = firstNode.getFullText().slice(start, end);
	sourceFile.removeText(start, end);
	return headerText;
}
