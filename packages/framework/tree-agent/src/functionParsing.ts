/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import { parse } from "acorn";
import type {
	Program,
	Statement,
	ModuleDeclaration,
	VariableDeclaration,
	Expression,
	AssignmentExpression,
	Pattern,
	Identifier,
	Literal,
	ExportNamedDeclaration,
	ExportDefaultDeclaration,
	FunctionDeclaration,
	FunctionExpression,
	ArrowFunctionExpression,
} from "acorn";

/**
 * Finds the name of the first invocable function in the given code string.
 */
export function findInvocableFunctionName(code: string): string | undefined {
	const program = parseProgram(code);
	if (program === undefined) {
		return undefined;
	}

	for (const node of program.body) {
		const name = getNameFromTopLevelNode(node);
		if (name !== undefined) {
			return name;
		}
	}

	return undefined;
}

/**
 * Removes top-level export syntax so that the provided code can execute in a classic script context.
 */
export function stripExportSyntax(code: string): string {
	const program = parseProgram(code);
	if (program === undefined) {
		return code;
	}

	const replacements: { start: number; end: number; replacement: string }[] = [];
	for (const node of program.body) {
		switch (node.type) {
			case "ExportNamedDeclaration": {
				if (node.declaration !== undefined && node.declaration !== null) {
					replacements.push({
						start: node.start,
						end: node.declaration.start,
						replacement: "",
					});
				} else {
					replacements.push({ start: node.start, end: node.end, replacement: "" });
				}

				break;
			}
			case "ExportDefaultDeclaration": {
				const { declaration, start, end } = node;
				if (
					declaration.type === "FunctionDeclaration" ||
					declaration.type === "FunctionExpression"
				) {
					replacements.push({
						start,
						end: declaration.start,
						replacement: "",
					});
				} else {
					replacements.push({ start, end, replacement: "" });
				}

				break;
			}
			case "ExportAllDeclaration": {
				replacements.push({ start: node.start, end: node.end, replacement: "" });

				break;
			}
			// No default
		}
	}

	if (replacements.length === 0) {
		return code;
	}

	replacements.sort((a, b) => b.start - a.start);
	let sanitized = code;
	for (const { start, end, replacement } of replacements) {
		sanitized = `${sanitized.slice(0, start)}${replacement}${sanitized.slice(end)}`;
	}
	return sanitized;
}

type TopLevelNode = Statement | ModuleDeclaration;

function parseProgram(code: string): Program | undefined {
	try {
		return parse(code, {
			ecmaVersion: "latest",
			sourceType: "module",
		});
	} catch {
		try {
			return parse(code, {
				ecmaVersion: "latest",
				sourceType: "script",
				allowReturnOutsideFunction: true,
				allowAwaitOutsideFunction: true,
				allowSuperOutsideMethod: true,
			});
		} catch {
			return undefined;
		}
	}
}

function getNameFromTopLevelNode(node: TopLevelNode): string | undefined {
	switch (node.type) {
		case "FunctionDeclaration": {
			return getFunctionIdentifier(node);
		}
		case "VariableDeclaration": {
			return getNameFromVariableDeclaration(node);
		}
		case "ExpressionStatement": {
			return getNameFromExpression(node.expression);
		}
		case "ExportNamedDeclaration": {
			return getNameFromExportNamed(node);
		}
		case "ExportDefaultDeclaration": {
			return getNameFromExportDefault(node);
		}
		default: {
			return undefined;
		}
	}
}

function getNameFromVariableDeclaration(node: VariableDeclaration): string | undefined {
	for (const declarator of node.declarations) {
		const name = getIdentifierFromPattern(declarator.id);
		if (name === undefined) {
			continue;
		}

		if (isFunctionLikeExpression(declarator.init)) {
			return name;
		}
	}

	return undefined;
}

function getNameFromExpression(
	expression: Expression | Literal | undefined,
): string | undefined {
	if (!isAssignmentExpression(expression)) {
		return undefined;
	}

	if (expression.operator !== "=") {
		return undefined;
	}

	const target = getIdentifierFromPattern(expression.left);
	if (target === undefined) {
		return undefined;
	}

	return isFunctionLikeExpression(expression.right) ? target : undefined;
}

function getNameFromExportNamed(node: ExportNamedDeclaration): string | undefined {
	const declaration = node.declaration;
	if (declaration !== undefined && declaration !== null) {
		if (declaration.type === "FunctionDeclaration") {
			const name = getFunctionIdentifier(declaration);
			if (name !== undefined) {
				return name;
			}
		} else if (declaration.type === "VariableDeclaration") {
			const name = getNameFromVariableDeclaration(declaration);
			if (name !== undefined) {
				return name;
			}
		}
	}

	if (node.source === undefined || node.source === null) {
		for (const specifier of node.specifiers) {
			const localName = getIdentifierName(specifier.local);
			if (localName !== undefined) {
				return localName;
			}
		}
	}

	return undefined;
}

function getNameFromExportDefault(node: ExportDefaultDeclaration): string | undefined {
	const declaration = node.declaration;
	if (declaration.type === "Identifier") {
		return declaration.name;
	}

	if (
		declaration.type === "FunctionDeclaration" ||
		declaration.type === "FunctionExpression"
	) {
		return getFunctionIdentifier(declaration);
	}

	return undefined;
}

function isAssignmentExpression(
	expression: Expression | Literal | undefined,
): expression is AssignmentExpression {
	return expression?.type === "AssignmentExpression";
}

function getIdentifierFromPattern(pattern: Pattern): string | undefined {
	if (pattern.type === "Identifier") {
		return pattern.name;
	}
	return undefined;
}

function isFunctionLikeExpression(
	expression: Expression | null | undefined,
): expression is FunctionExpression | ArrowFunctionExpression {
	return (
		expression?.type === "FunctionExpression" || expression?.type === "ArrowFunctionExpression"
	);
}

function getFunctionIdentifier(
	fn: FunctionDeclaration | FunctionExpression | { id?: Identifier | null },
): string | undefined {
	const id = fn.id;
	if (id === undefined || id === null) {
		return undefined;
	}
	return id.name;
}

function getIdentifierName(node: Identifier | Literal): string | undefined {
	if (node.type === "Identifier") {
		return node.name;
	}
	return undefined;
}
