/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExportDeclaration, ExportedDeclarations, JSDoc, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import type { ApiTag } from "./apiTag";
import { isKnownApiTag } from "./apiTag";

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
	 * Entries here represent exports with unrecognized tags.
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
 * Searches given JSDocs for known {@link ApiTag} tag.
 *
 * @returns Recognized {@link ApiTag} from JSDocs or undefined.
 */
function getApiTagFromDocs(jsdocs: JSDoc[]): ApiTag | undefined {
	for (const jsdoc of jsdocs) {
		for (const tag of jsdoc.getTags()) {
			const tagName = tag.getTagName();
			if (isKnownApiTag(tagName)) {
				return tagName;
			}
		}
	}
	return undefined;
}

/**
 * Searches given Node's JSDocs for known {@link ApiTag} tag.
 *
 * @returns Recognized {@link ApiTag} from JSDocs or undefined.
 */
function getNodeApiTag(node: Node): ApiTag | undefined {
	if (Node.isJSDocable(node)) {
		return getApiTagFromDocs(node.getJsDocs());
	}

	// Some nodes like `ExportSpecifier` are not JSDocable per ts-morph, but
	// a JSDoc is present.
	const jsdocChildren = node.getChildrenOfKind(SyntaxKind.JSDoc);
	if (jsdocChildren.length > 0) {
		return getApiTagFromDocs(jsdocChildren);
	}

	// Some nodes like `VariableDeclaration`s are not JSDocable, but an ancestor
	// like `VariableStatement` is and may contain tag.
	const parent = node.getParent();
	if (parent !== undefined) {
		return getNodeApiTag(parent);
	}

	return undefined;
}

/**
 * Given a source file extracts all of the named exports and associated API tag.
 * Named exports without a recognized tag are placed in unknown array.
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
	// share the same tag. Track and throw if there are different tags.
	const foundNameTags = new Map<string, ApiTag>();
	for (const [name, exportedDecls] of exported.entries()) {
		for (const exportedDecl of exportedDecls) {
			const tag = getNodeApiTag(exportedDecl);
			const existingTag = foundNameTags.get(name);
			if (tag === undefined) {
				// Overloads might only have JSDocs for first of set; so ignore
				// secondary exports without recognized tag.
				if (existingTag === undefined) {
					records.unknown.set(name, { exportedDecl });
				}
			} else if (existingTag === undefined) {
				records[tag].push({ name, isTypeOnly: isTypeExport(exportedDecl) });
				foundNameTags.set(name, tag);
			} else if (tag !== existingTag) {
				throw new Error(
					`${name} has been exported twice with different api tags.\nFirst as ${existingTag} and now as ${tag} from ${exportedDecl
						.getSourceFile()
						.getFilePath()}:${exportedDecl.getStartLineNumber()}.`,
				);
			}
		}
	}

	// If we have found tags for all things exported, then nothing else left to look for.
	if (records.unknown.size === 0) {
		return records;
	}

	// Otherwise, look for some special cases where tag tagging may appear in source itself.

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
				const namespaceTag = getNodeApiTag(exportDeclaration);
				if (namespaceTag === undefined) {
					unknownExported.exportDecl = exportDeclaration;
				} else {
					records[namespaceTag].push({ name, isTypeOnly: exportDeclaration.isTypeOnly() });
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
				const exportTag = getNodeApiTag(exportSpecifier);
				if (exportTag === undefined) {
					unknownExported.exportDecl = exportDeclaration;
				} else {
					records[exportTag].push({
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
