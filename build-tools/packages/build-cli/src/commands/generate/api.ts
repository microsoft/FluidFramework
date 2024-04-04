/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { Flags } from "@oclif/core";
import { Project, SourceFile, ModuleKind, Node, ScriptKind } from "ts-morph";

import { BaseCommand } from "../../base.js";
import type { CommandLogger } from "../../logging.js";

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
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint, outDir } = this.flags;

		const apiMap = new ApiLevelReader(this.logger);

		return generateEntrypoints(mainEntrypoint, outDir, apiMap, this.logger);
	}
}

// /**
//  * Extract header comments at the beginning of the file.
//  */
// function readFileHeaderComment(sourceFile: SourceFile): string {
// 	const firstNode = sourceFile.getChildAtIndex(0);
// 	const start = sourceFile.getPos(); // should be 0
// 	const end = start + sourceFile.getLeadingTriviaWidth();

// 	return firstNode.getFullText().slice(start, end);
// }

async function generateEntrypoints(
	mainEntrypoint: string,
	outDir: string,
	apiMap: ApiLevelReader,
	log: CommandLogger,
): Promise<void> {
	/**
	 * List of source file save promises. Used to collect modified source file save promises so we can await them all at
	 * once.
	 */
	const fileSavePromises: Promise<void>[] = [];

	log.info(`Processing: ${mainEntrypoint}`);

	// Iterate over each source file, looking for Fluid imports
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: { module: ModuleKind.Node16 },
	});
	const mainSourceFile = project.addSourceFileAtPath(mainEntrypoint);
	// const header = readFileHeaderComment(mainSourceFile);
	// const structure = mainSourceFile.getStructure();
	// structure.leadingTrivia = readFileHeaderComment(mainSourceFile);
	const original = mainSourceFile.getStatementsWithComments();

	const apiLevels: Exclude<ApiLevel, typeof internalLevel>[] = [
		publicLevel,
		betaLevel,
		alphaLevel,
	];
	while (apiLevels.length > 0) {
		const apiLevel = apiLevels[apiLevels.length - 1];
		const outFile = path.join(outDir, `foo-${apiLevel}.d.ts`);
		log.info(`\tGenerating ${outFile}`);
		const sourceFile = project.createSourceFile(outFile, undefined, {
			overwrite: true,
			scriptKind: ScriptKind.TS,
		});
		// Add statements without the first if it happens to be replicated in the second, which seems to be the case with header comment block.
		const startStatement =
			original.length > 1 &&
			original[1].getFullText().startsWith(original[0].getFullText().trimEnd())
				? 1
				: 0;
		// Using simple comment-less structure would be nice, but some comments matter like retagging for deprecation.
		sourceFile.addStatements(original.slice(startStatement).map((s) => s.getFullText()));

		apiMap.trimExports(sourceFile, apiLevels);

		fileSavePromises.push(sourceFile.save());

		apiLevels.pop();
	}

	// We don't want to save the project since we may have made temporary edits to some source files.
	// Instead, we save files individually.
	await Promise.all(fileSavePromises);
}

class ApiLevelReader {
	// private readonly project = new Project({
	// 	skipAddingFilesFromTsConfig: true,
	// 	compilerOptions: {
	// 		module: ModuleKind.Node16,
	// 	},
	// });

	// private readonly tempSource = this.project.createSourceFile("flub-generate-api-temp.d.ts");

	// eslint-disable-next-line no-useless-constructor
	constructor(private readonly log: CommandLogger) {}

	public trimExports(sourceFile: SourceFile, allowedLevels: readonly ApiLevel[]): void {
		const exported = sourceFile.getExportedDeclarations();
		for (const [name, exportedDecls] of exported.entries()) {
			for (const exportedDecl of exportedDecls) {
				const levelAndNode = getNodeLevel(exportedDecl);
				if (levelAndNode === undefined) {
					this.log.warning(
						`\t${sourceFile.getFilePath()} export ${name} API level was not recognized.`,
					);
				} else {
					this.log.verbose(
						`\t${sourceFile.getFilePath()} export ${name} is ${levelAndNode.level}.`,
					);
				}
				if (levelAndNode === undefined || !allowedLevels.includes(levelAndNode.level)) {
					const node = levelAndNode?.node ?? exportedDecl;
					const nodeSource = node.getSourceFile().getFilePath();
					if (nodeSource === sourceFile.getFilePath()) {
						this.log.info(`\t${sourceFile.getFilePath()} removing export ${name}.`);
						node.replaceWithText(`/* ${name} has been removed */`);
					} else {
						this.log.errorLog(`export ${name}'s node is in other source: ${nodeSource}.`);
					}
				}
			}
		}
	}
}

function isKnownLevel(level: string): level is ApiLevel {
	return (knownLevels as readonly string[]).includes(level);
}

/**
 * Searches given Node's JSDocs for known {@link ApiLevel} tag.
 *
 * @returns Recognized {@link ApiLevel} from JSDocs or undefined.
 */
function getNodeLevel(node: Node): { level: ApiLevel; node: Node } | undefined {
	if (Node.isJSDocable(node)) {
		for (const jsdoc of node.getJsDocs()) {
			for (const tag of jsdoc.getTags()) {
				const tagName = tag.getTagName();
				if (isKnownLevel(tagName)) {
					return { level: tagName, node };
				}
			}
		}
	} else {
		// Some nodes like `VariableDeclaration`s as not JSDocable, but an ancestor
		// like `VariableStatement` is and may contain tag.
		const parent = node.getParent();
		if (parent !== undefined) {
			return getNodeLevel(parent);
		}
	}
	return undefined;
}
