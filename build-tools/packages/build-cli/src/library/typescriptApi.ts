/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SourceFile, ExportedDeclarations } from "ts-morph";
import { Node } from "ts-morph";

import { ApiLevel, isKnownApiLevel } from "./apiLevel.js";

interface ExportRecord {
	name: string;
	isTypeOnly: boolean;
}
export interface ExportRecords {
	public: ExportRecord[];
	beta: ExportRecord[];
	alpha: ExportRecord[];
	internal: ExportRecord[];
	unknown: { name: string; decl: ExportedDeclarations }[];
}

/**
 * This function is a placeholder for functionality that could
 * be very useful to have when working with multiple exports
 * using the same name (basically both a type and value export).
 */
function isTypeExport(_decl: ExportedDeclarations): boolean {
	return false;
}

/**
 * Searches given Node's JSDocs for known {@link ApiLevel} tag.
 *
 * @returns Recognized {@link ApiLevel} from JSDocs or undefined.
 */
function getNodeLevel(node: Node): ApiLevel | undefined {
	if (Node.isJSDocable(node)) {
		for (const jsdoc of node.getJsDocs()) {
			for (const tag of jsdoc.getTags()) {
				const tagName = tag.getTagName();
				if (isKnownApiLevel(tagName)) {
					return tagName;
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
		unknown: [],
	};
	// We can't (don't know how to) distinguish duplication in exports
	// from a type and a value export. We expect however that those will
	// share the same level. Track and throw if there are different levels.
	const foundNameLevels = new Map<string, ApiLevel>();
	for (const [name, exportedDecls] of exported.entries()) {
		for (const exportedDecl of exportedDecls) {
			const level = getNodeLevel(exportedDecl);
			if (level === undefined) {
				records.unknown.push({ name, decl: exportedDecl });
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

	return records;
}
