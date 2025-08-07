/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExportDeclaration, ExportedDeclarations, JSDoc, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import type { ApiLevel } from "./apiLevel.js";
import type { ReleaseLevel } from "./releaseLevel.js";
import { isReleaseLevel } from "./releaseLevel.js";

interface ExportRecord {
	name: string;
	isTypeOnly: boolean;
}
interface ExportRecords {
	public: ExportRecord[];
	beta: ExportRecord[];
	alpha: ExportRecord[];
	internal: ExportRecord[];
	legacyPublic: ExportRecord[];
	legacyBeta: ExportRecord[];
	legacyAlpha: ExportRecord[];
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
 * API support level details.
 */
interface ApiSupportLevelInfo {
	/**
	 * The release level, derived from a corresponding TSDoc release tag.
	 */
	releaseLevel: ReleaseLevel;

	/**
	 * Whether or not the API is "legacy".
	 * @see {@link https://fluidframework.com/docs/build/releases-and-apitags#api-support-levels}
	 */
	isLegacy: boolean;
}

/**
 * Searches the given JSDocs for known release tags and returns the appropriate {@link ApiSupportLevelInfo | support details} (if any).
 */
function getApiTagsFromDocs(jsdocs: JSDoc[]): ApiSupportLevelInfo | undefined {
	let releaseLevel: ReleaseLevel | undefined;
	let isLegacy = false;
	for (const jsdoc of jsdocs) {
		const tags = jsdoc.getTags();
		for (const tag of tags) {
			const tagName = tag.getTagName();
			if (isReleaseLevel(tagName)) {
				if (releaseLevel !== undefined) {
					throw new Error(
						`Multiple release tags found in JSDoc: ${releaseLevel} and ${tagName}. An API must have at most 1 release tag.`,
					);
				}
				releaseLevel = tagName;
			} else if (tagName === "legacy") {
				isLegacy = true;
			}
		}
	}
	return releaseLevel === undefined ? undefined : { releaseLevel: releaseLevel, isLegacy };
}

/**
 * Searches the given node's JSDocs for known release tags and returns the appropriate {@link ApiSupportLevelInfo | support details} (if any).
 */
function getNodeApiTags(node: Node): ApiSupportLevelInfo | undefined {
	if (Node.isJSDocable(node)) {
		return getApiTagsFromDocs(node.getJsDocs());
	}

	// Some nodes like `ExportSpecifier` are not JSDocable per ts-morph, but
	// a JSDoc is present.
	const jsdocChildren = node.getChildrenOfKind(SyntaxKind.JSDoc);
	if (jsdocChildren.length > 0) {
		return getApiTagsFromDocs(jsdocChildren);
	}

	// Some nodes like `VariableDeclaration`s are not JSDocable, but an ancestor
	// like `VariableStatement` is and may contain tag.
	const parent = node.getParent();
	if (parent !== undefined) {
		return getNodeApiTags(parent);
	}

	return undefined;
}

function getApiLevelFromTags(tags: ApiSupportLevelInfo): ApiLevel {
	const { releaseLevel: releaseTag, isLegacy } = tags;
	switch (releaseTag) {
		case "public": {
			return isLegacy ? "legacyPublic" : "public";
		}
		case "beta": {
			return isLegacy ? "legacyBeta" : "beta";
		}
		case "alpha": {
			return isLegacy ? "legacyAlpha" : "alpha";
		}
		case "internal": {
			if (isLegacy) {
				throw new Error("@legacy + @internal is not supported. Use @internal only.");
			}
			return "internal";
		}
		default: {
			throw new Error(`Unknown release tag: ${releaseTag}`);
		}
	}
}

/**
 * Searches the given node's JSDocs for known release tags and returns the appropriate {@link ApiLevel | API support level} (if any).
 */
function getNodeApiLevel(node: Node): ApiLevel | undefined {
	const apiTags = getNodeApiTags(node);
	if (apiTags === undefined) {
		return undefined;
	}

	try {
		return getApiLevelFromTags(apiTags);
	} catch (error) {
		throw new Error(
			`Error getting API level for ${node.getSymbol()} at ${node
				.getSourceFile()
				.getFilePath()}:${node.getStartLineNumber()}${(error as Error).message ? `: ${(error as Error).message}` : ""}`,
		);
	}
}

/**
 * Given a source file, extracts all of the named exports and associated support levels.
 * Named exports without a recognized tag are placed in unknown array.
 */
export function getApiExports(sourceFile: SourceFile): ExportRecords {
	const exported = sourceFile.getExportedDeclarations();
	const records: ExportRecords = {
		public: [],
		beta: [],
		alpha: [],
		legacyPublic: [],
		legacyBeta: [],
		legacyAlpha: [],
		internal: [],
		unknown: new Map(),
	};
	// We can't (don't know how to) distinguish duplication in exports
	// from a type and a value export. We expect however that those will
	// share the same tag. Track and throw if there are different tags.
	const foundNameLevels = new Map<string, ApiLevel>();
	for (const [name, exportedDecls] of exported.entries()) {
		for (const exportedDecl of exportedDecls) {
			const level = getNodeApiLevel(exportedDecl);
			const existingLevel = foundNameLevels.get(name);
			if (level === undefined) {
				// Overloads might only have JSDocs for first of set; so ignore
				// secondary exports without recognized tag.
				if (existingLevel === undefined) {
					records.unknown.set(name, { exportedDecl });
				}
			} else if (existingLevel === undefined) {
				records[level].push({ name, isTypeOnly: isTypeExport(exportedDecl) });
				foundNameLevels.set(name, level);
			} else if (level !== existingLevel) {
				throw new Error(
					`${name} has been exported twice with different api level.\nFirst as ${existingLevel} and now as ${level} from ${exportedDecl
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
				const namespaceLevel = getNodeApiLevel(exportDeclaration);
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
				const exportLevel = getNodeApiLevel(exportSpecifier);
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

/**
 * Searches given source file for the package documentation (first
 * `@packageDocumentation` tagged comment).
 *
 * @returns Found full text of the package documentation or empty string.
 *
 * @privateRemarks
 * If we find trouble with practical extraction, consider replicating api-extractor's logic at:
 * {@link https://github.com/microsoft/rushstack/blob/main/apps/api-extractor/src/aedoc/PackageDocComment.ts}
 *
 * Here a simplified approach is taken leveraging ts-morph's comment organization.
 */
export function getPackageDocumentationText(sourceFile: SourceFile): string {
	const statements = sourceFile.getStatementsWithComments();
	for (const statement of statements) {
		const comments = statement.getLeadingCommentRanges();
		for (const comment of comments) {
			const jsDoc = comment.getText();
			if (jsDoc.includes("@packageDocumentation")) {
				return jsDoc;
			}
		}
	}

	return "";
}
