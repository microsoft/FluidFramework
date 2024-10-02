/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-array-callback-reference */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Flags } from "@oclif/core";
import * as JSON5 from "json5";
import { type ImportDeclaration, ModuleKind, Project, SourceFile } from "ts-morph";
import {
	ApiLevel,
	BaseCommand,
	getApiExports,
	isKnownApiLevel,
	knownApiLevels,
} from "../../library/index.js";
import type { CommandLogger } from "../../logging.js";

const maxConcurrency = 4;

/**
 * Known scopes of Fluid Framework packages.
 *
 * @remarks
 *
 * The allowed scopes are actually configurable in the root fluidBuild config, so this list will need to be updated if
 * new Fluid Framework scopes are used.
 */
const knownFFScopes = [
	"@fluidframework",
	"@fluid-example",
	"@fluid-experimental",
	"@fluid-internal",
	"@fluid-private",
	"@fluid-tools",
] as const;

/**
 * FF packages that exist outside of a scope that starts with `@fluid`.
 */
const unscopedFFPackages: ReadonlySet<string> = new Set(["fluid-framework", "tinylicious"]);

/**
 * Rewrite imports for Fluid Framework APIs to use the correct subpath import (/beta, /legacy, etc.).
 */
export default class UpdateFluidImportsCommand extends BaseCommand<
	typeof UpdateFluidImportsCommand
> {
	static readonly description =
		`Rewrite imports for Fluid Framework APIs to use the correct subpath import (/beta, /legacy, etc.)`;

	static readonly flags = {
		tsconfigs: Flags.file({
			description:
				"Tsconfig file paths that will be used to load project files. When multiple are given all must depend on the same version of packages; otherwise results are unstable.",
			default: ["./tsconfig.json"],
			multiple: true,
		}),
		packageRegex: Flags.string({
			description: "Regular expression filtering import packages to adjust",
		}),
		data: Flags.file({
			description:
				"Optional path to a data file containing raw API level data. Overrides API levels extracted from package data.",
			exists: true,
		}),
		onlyInternal: Flags.boolean({
			description: "Use /internal for all non-public APIs instead of /beta or /legacy.",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { tsconfigs, packageRegex, data, onlyInternal } = this.flags;

		const foundConfigs = tsconfigs.filter((file) => {
			const exists = existsSync(file);
			if (!exists) {
				this.warning(`Can't find config file: ${file}`);
			}
			return exists;
		});

		if (foundConfigs.length === 0) {
			this.error(`No config files found.`, { exit: 1 });
		}

		const apiLevelData = data === undefined ? undefined : await loadData(data, onlyInternal);
		const packagesRegex = new RegExp(packageRegex ?? "");
		const apiMap = new ApiLevelReader(this.logger, packagesRegex, onlyInternal, apiLevelData);

		// Note that while there is a queue here it is only really a queue for file saves
		// which are the only async aspect currently and aren't expected to take so long.
		// If more aspects are done concurrently, make maxConcurrency an option.
		const queue: Promise<void>[] = [];
		for (const { tsConfigFilePath, sources } of getSourceFiles(foundConfigs)) {
			this.info(
				`Processing ${tsConfigFilePath} and ${sources.length} source${
					sources.length === 1 ? "" : "s"
				}.`,
			);
			if (sources.length > 0) {
				queue.push(updateImports(sources, apiMap, this.logger));
				if (queue.length >= maxConcurrency) {
					// naively wait for the first scheduled to finish
					// eslint-disable-next-line no-await-in-loop
					await queue.shift();
				}
			}
		}
		await Promise.all(queue);
	}
}

type PackageName = string;

interface FluidImportDataBase {
	index: number;
	packageName: PackageName;
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
		private readonly apiMap: ApiLevelReader,
		private readonly log: CommandLogger,
	) {
		this.fluidImports = parseFluidImports(sourceFile, log);
	}

	public process(): boolean {
		if (this.fluidImports.length === 0) {
			return false;
		}

		let modificationsRequired = false;

		// Collect the existing declarations
		for (const {
			importDeclaration,
			packageName,
			level,
			declaration: { moduleSpecifier },
		} of this.fluidImports) {
			const data = this.apiMap.get(packageName);

			// Skip modules with no mapping
			if (data === undefined) {
				this.log.verbose(`Skipping: ${moduleSpecifier}`);
				continue;
			}

			const namedImports = importDeclaration.getNamedImports();
			const isTypeOnly = importDeclaration.isTypeOnly();

			this.log.verbose(`Reviewing: ${moduleSpecifier}...`);
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
					/* default */ ApiLevel.public,
					this.log,
				);

				this.log.verbose(
					`\t\tFound import named: '${fullImportSpecifierText}' (${expectedLevel})`,
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
		packageName: PackageName;
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

		const moduleSpecifier =
			level === ApiLevel.public ? packageName : `${packageName}/${level}`;
		// Order imports primarily by level then secondarily: type, untyped
		const order = knownApiLevels.indexOf(level) * 2 + (isTypeOnly ? 0 : 1);
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
		packageName: PackageName,
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
	data: NamedExportToLevel,
	defaultValue: ApiLevel,
	log: CommandLogger,
): ApiLevel {
	const level = data.get(name);
	if (level !== undefined) {
		return level;
	}
	log.warning(`\tassuming ${defaultValue} level for "${name}"`);
	return defaultValue;
}

function* getSourceFiles(
	tsconfigFilePaths: string[],
): IterableIterator<{ tsConfigFilePath: string; sources: SourceFile[] }> {
	// ts-morph processing will pull sources from references and caller may very well have specified project
	// files that reference one another. Each source should only be processed once. So build a unique
	// SourceFile list from full paths.
	const sources = new Set<string>();

	for (const tsConfigFilePath of tsconfigFilePaths) {
		const project = new Project({
			tsConfigFilePath,
		});
		yield {
			tsConfigFilePath,
			sources: project
				.getSourceFiles(
					// Limit to sources in the current working directory
					"./**",
				)
				// Filter out type files - this may not be correct in projects with manually defined declarations.
				.filter((source) => source.getExtension() !== ".d.ts")
				.filter((source) => {
					const fullPath = source.getFilePath();
					const alreadyVisiting = sources.has(fullPath);
					if (!alreadyVisiting) {
						sources.add(fullPath);
					}
					return !alreadyVisiting;
				}),
		};
	}
}

async function updateImports(
	sourceFiles: SourceFile[],
	apiMap: ApiLevelReader,
	log: CommandLogger,
): Promise<void> {
	/**
	 * List of source file save promises. Used to collect modified source file save promises so we can await them all at
	 * once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	// Iterate over each source file, looking for Fluid imports
	for (const sourceFile of sourceFiles) {
		log.info(`Processing: ${sourceFile.getFilePath()}`);

		// Delete any header comments at the beginning of the file. Save the text so we can re-insert it at the end of
		// processing. Note that this does modify the source file, but we only save changes if the imports are updated, so
		// the removal will not be persisted unless there are import changes. In that case we re-add the header before we
		// save. Therefore it's safe to remove the header here even before we know if we need to write the file.
		const headerText = removeFileHeaderComment(sourceFile);

		const importManager = new FluidImportManager(sourceFile, apiMap, log);
		if (importManager.process()) {
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
	if (!isKnownApiLevel(level)) {
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

	const order = knownApiLevels.indexOf(level) * 2 + (importDeclaration.isTypeOnly() ? 0 : 1);
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

/**
 * Returns true if an import is from a known Fluid Framework package or scope.
 *
 * @param packageName - The name of the package to check.
 * @returns True if the package is a Fluid Framework package; false otherwise.
 */
function isFluidImport(packageName: PackageName): boolean {
	return (
		knownFFScopes.some((scope) => packageName.startsWith(`${scope}/`)) ||
		unscopedFFPackages.has(packageName)
	);
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

type NamedExportToLevel = Map<string, ApiLevel>;
type MapData = Map<PackageName, NamedExportToLevel>;

class ApiLevelReader {
	private readonly project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: {
			module: ModuleKind.Node16,
		},
	});

	private readonly tempSource = this.project.createSourceFile("flub-fluid-importer-temp.ts");
	private readonly map: Map<PackageName, NamedExportToLevel | undefined>;

	constructor(
		private readonly log: CommandLogger,
		private readonly packagesRegex: RegExp,
		private readonly onlyInternal: boolean,
		initialMap?: MapData,
	) {
		this.map = new Map<PackageName, NamedExportToLevel>(initialMap);
		for (const k of this.map.keys()) {
			if (!this.packagesRegex.test(k)) {
				this.map.set(k, undefined);
			}
		}
	}

	public get(packageName: PackageName): NamedExportToLevel | undefined {
		if (this.map.has(packageName)) {
			return this.map.get(packageName);
		}
		const loadResult = this.packagesRegex.test(packageName)
			? this.loadPackageData(packageName)
			: undefined;
		this.map.set(packageName, loadResult);
		return loadResult;
	}

	private loadPackageData(packageName: PackageName): NamedExportToLevel | undefined {
		const internalImport = this.tempSource.addImportDeclaration({
			moduleSpecifier: `${packageName}/internal`,
		});
		const internalSource = internalImport.getModuleSpecifierSourceFile();
		if (internalSource === undefined) {
			this.log.warning(`no /internal export from ${packageName}`);
			return undefined;
		}
		this.log.verbose(`\tLoading ${packageName} API data from ${internalSource.getFilePath()}`);

		const exports = getApiExports(internalSource);
		for (const name of exports.unknown.keys()) {
			// Suppress any warning for EventEmitter as this export is currently a special case.
			// See AB#7377 for replacement status upon which this can be removed.
			if (name !== "EventEmitter") {
				this.log.warning(`\t\t${packageName} ${name} API level was not recognized.`);
			}
		}

		const memberData = new Map<string, ApiLevel>();
		addUniqueNamedExportsToMap(exports.public, memberData, ApiLevel.public);
		if (this.onlyInternal) {
			addUniqueNamedExportsToMap(exports.legacy, memberData, ApiLevel.internal);
			addUniqueNamedExportsToMap(exports.beta, memberData, ApiLevel.internal);
			addUniqueNamedExportsToMap(exports.alpha, memberData, ApiLevel.internal);
		} else {
			addUniqueNamedExportsToMap(exports.legacy, memberData, ApiLevel.legacy);
			addUniqueNamedExportsToMap(exports.beta, memberData, ApiLevel.beta);
			if (exports.alpha.length > 0) {
				// @alpha APIs have been mapped to both /alpha and /legacy paths.
				// Later @legacy tag was added explicitly.
				// Check for a /alpha export to map @alpha as alpha.
				const alphaExport =
					this.tempSource
						.addImportDeclaration({
							moduleSpecifier: `${packageName}/alpha`,
						})
						.getModuleSpecifierSourceFile() !== undefined;
				addUniqueNamedExportsToMap(
					exports.alpha,
					memberData,
					alphaExport ? ApiLevel.alpha : ApiLevel.legacy,
				);
			}
		}
		addUniqueNamedExportsToMap(exports.internal, memberData, ApiLevel.internal);
		return memberData;
	}
}

function addUniqueNamedExportsToMap(
	exports: { name: string }[],
	map: Map<string, ApiLevel>,
	level: ApiLevel,
): void {
	for (const { name } of exports) {
		const existing = map.get(name);
		if (existing !== undefined) {
			throw new Error(`"${name}" already has entry mapped to ${existing}`);
		}
		map.set(name, level);
	}
}

async function loadData(dataFile: string, onlyInternal: boolean): Promise<MapData> {
	// Load the raw data file
	// eslint-disable-next-line unicorn/no-await-expression-member
	const rawData: string = (await readFile(dataFile)).toString();
	const apiLevelDataRaw: Record<string, MemberDataRaw[]> = JSON5.parse(rawData);

	// Transform the raw data into a more useable form
	const apiLevelData = new Map<PackageName, NamedExportToLevel>();
	for (const [moduleName, members] of Object.entries(apiLevelDataRaw)) {
		const entry = apiLevelData.get(moduleName) ?? new Map<string, ApiLevel>();
		for (const member of members) {
			const { level } = member;
			if (!isKnownApiLevel(level)) {
				throw new Error(`Unknown API level: ${level}`);
			}
			addUniqueNamedExportsToMap(
				[member],
				entry,
				onlyInternal &&
					(level === ApiLevel.beta || level === ApiLevel.alpha || level === ApiLevel.legacy)
					? ApiLevel.internal
					: level,
			);
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
