/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SourceFile, ExportedDeclarations } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

import { ApiLevel, isKnownApiLevel } from "./apiLevel.js";

interface ExportRecord {
	name: string;
	type: string;
}
export interface ExportRecords {
	public: ExportRecord[];
	beta: ExportRecord[];
	alpha: ExportRecord[];
	internal: ExportRecord[];
	unknown: { name: string; decl: ExportedDeclarations }[];
}

function isTypeExport(decl: ExportedDeclarations): boolean {
	console.log(`${decl.getStartLineNumber()}: ${decl.getKindName()}: "${decl.getFullText()}"`);
	return decl.isKind(SyntaxKind.ExportDeclaration);
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

export function getApiExports(sourceFile: SourceFile): ExportRecords {
	const exported = sourceFile.getExportedDeclarations();
	const records: ExportRecords = {
		public: [],
		beta: [],
		alpha: [],
		internal: [],
		unknown: [],
	};
	for (const [name, exportedDecls] of exported.entries()) {
		for (const exportedDecl of exportedDecls) {
			const level = getNodeLevel(exportedDecl);
			if (level === undefined) {
				records.unknown.push({ name, decl: exportedDecl });
			} else {
				records[level].push({ name, type: isTypeExport(exportedDecl) ? "type" : "value" });
			}
		}
	}

	return records;
}
