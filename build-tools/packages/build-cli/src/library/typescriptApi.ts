/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExportDeclaration, ExportedDeclarations, SourceFile } from "ts-morph";
import { JSDoc, Node, SyntaxKind } from "ts-morph";

import { ApiLevel, isKnownApiLevel } from "./apiLevel";

interface ExportRecord {
	name: string;
	isTypeOnly: boolean;
}
interface ExportRecords {
	public: ExportRecord[];
	beta: ExportRecord[];
	alpha: ExportRecord[];
	internal: ExportRecord[];
	/**
	 * Entries here represent exports with unrecognized levels.
	 * These may be errors or just concerns depending on context.
	 * ExportedDeclarations provides context for the origin of
	 * such cases.
	 */
	unknown: Map<string, { exportedDecl: ExportedDeclarations; exportDecl?: ExportDeclaration }>;
}

/**
 * This function is a placeholder for functionality that could
 * be very useful to have when working with multiple exports
 * using the same name (basically both a type and value export).
 *
 * This may be addressable by walking the various ExportDeclarations
 * from the source. This is done for some special cases, but
 * should reveal the type-only-ness and then records could be
 * updated.
 */
function isTypeExport(_decl: ExportedDeclarations): boolean {
	return false;
}

/**
 * Searches given JSDocs for known {@link ApiLevel} tag.
 *
 * @returns Recognized {@link ApiLevel} from JSDocs or undefined.
 */
function getLevelFromDocs(jsdocs: JSDoc[]): ApiLevel | undefined {
	for (const jsdoc of jsdocs) {
		for (const tag of jsdoc.getTags()) {
			const tagName = tag.getTagName();
			if (isKnownApiLevel(tagName)) {
				return tagName;
			}
		}
	}
	return undefined;
}

/**
 * Searches given Node's JSDocs for known {@link ApiLevel} tag.
 *
 * @returns Recognized {@link ApiLevel} from JSDocs or undefined.
 */
function getNodeLevel(node: Node): ApiLevel | undefined {
	if (Node.isJSDocable(node)) {
		return getLevelFromDocs(node.getJsDocs());
	}

	// Some nodes like `ExportSpecifier` are not JSDocable per ts-morph, but
	// a JSDoc is present.
	const jsdocChildren = node.getChildrenOfKind(SyntaxKind.JSDoc);
	if (jsdocChildren.length > 0) {
		return getLevelFromDocs(jsdocChildren);
	}

	// Some nodes like `VariableDeclaration`s are not JSDocable, but an ancestor
	// like `VariableStatement` is and may contain tag.
	const parent = node.getParent();
	if (parent !== undefined) {
		return getNodeLevel(parent);
	}

	return undefined;
}

/**
 * Given a source file extracts all of the named exports and associated API level.
 * Named exports without a recognized level are placed in unknown array.
 */
export function getApiExports(sourceFile: SourceFile): ExportRecords {
	const exported = sourceFile.getExportedDeclarations();
	const records: ExportRecords = {
		public: [],
		beta: [],
		alpha: [],
		internal: [],
		unknown: new Map(),
	};
	// We can't (don't know how to) distinguish duplication in exports
	// from a type and a value export. We expect however that those will
	// share the same level. Track and throw if there are different levels.
	const foundNameLevels = new Map<string, ApiLevel>();
	for (const [name, exportedDecls] of exported.entries()) {
		for (const exportedDecl of exportedDecls) {
			const level = getNodeLevel(exportedDecl);
			if (level === undefined) {
				records.unknown.set(name, { exportedDecl });
			} else {
				const existingLevel = foundNameLevels.get(name);
				if (existingLevel === undefined) {
					records[level].push({ name, isTypeOnly: isTypeExport(exportedDecl) });
					foundNameLevels.set(name, level);
				} else if (level !== existingLevel) {
					throw new Error(
						`${name} has been exported twice with different api levels.\nFirst as ${existingLevel} and now as ${level} from ${exportedDecl
							.getSourceFile()
							.getFilePath()}:${exportedDecl.getStartLineNumber()}.`,
					);
				}
			}
		}
	}

	// If we have found levels for all things exported, then nothing else left to look for.
	if (records.unknown.size === 0) {
		return records;
	}

	// Otherwise, look for some special cases where level tagging may appear in source itself.

	// Note that these are not exported declarations, but specifically
	// given file's export declarations.
	const exportDeclarations = sourceFile.getExportDeclarations();
	for (const exportDeclaration of exportDeclarations) {
		// Uncomment below lines for some extra debugging help to show document structure:
		// console.log(
		// 	`export @ ${exportDeclaration.getStartLineNumber()} has children:\n\t${exportDeclaration
		// 		.getChildren()
		// 		.map((c) => c.getKindName())
		// 		.join("\n\t")}`,
		// );

		// Look first for namespace exports like `export * as foo`.
		for (const namespaceDecl of exportDeclaration.getChildrenOfKind(
			SyntaxKind.NamespaceExport,
		)) {
			const name = namespaceDecl.getName();
			const unknownExported = records.unknown.get(name);
			if (unknownExported !== undefined) {
				console.log(
					`namespace exports of the form 'export * as foo' are speculatively supported. See ${sourceFile.getFilePath()}:${namespaceDecl.getStartLineNumber()}:\n${namespaceDecl.getText()}`,
				);
				const namespaceLevel = getNodeLevel(exportDeclaration);
				if (namespaceLevel === undefined) {
					unknownExported.exportDecl = exportDeclaration;
				} else {
					records[namespaceLevel].push({ name, isTypeOnly: exportDeclaration.isTypeOnly() });
					records.unknown.delete(name);
					if (records.unknown.size === 0) {
						return records;
					}
				}
			}
		}

		// Then process named exports. Common case for named export is patch for api-extractor
		// limitation on namespace exports:
		//   import * as foo from "bar";
		//   export { foo }
		// Entire foo namespace may be tagged by:
		//   export {
		//     /** @internal */
		//     foo
		//   }
		// Note that per namespace level tags maybe different than the namespace. To avoid any
		// accidental exposure only tag a namespace with the most limited tag present.
		for (const exportSpecifier of exportDeclaration.getNamedExports()) {
			const name = exportSpecifier.getName();
			const unknownExported = records.unknown.get(name);
			if (unknownExported !== undefined) {
				const exportLevel = getNodeLevel(exportSpecifier);
				if (exportLevel === undefined) {
					unknownExported.exportDecl = exportDeclaration;
				} else {
					records[exportLevel].push({
						name,
						isTypeOnly: exportDeclaration.isTypeOnly() || exportSpecifier.isTypeOnly(),
					});
					records.unknown.delete(name);
					if (records.unknown.size === 0) {
						return records;
					}
				}
			}
		}
	}

	return records;
}
