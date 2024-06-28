/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node, ts } from "ts-morph";

export interface TypeData {
	/**
	 * Includes namespace prefix if needed.
	 */
	readonly name: string;
	readonly kind: string;
	readonly node: Node;
	readonly tags: ReadonlySet<string>;
}

/**
 * Creates a non-colliding "mangled" identifier for the type.
 */
export function getFullTypeName(typeData: TypeData) {
	return `${typeData.kind}_${typeData.name.replace(/\./g, "_")}`;
}

/**
 * Generate an expression to include into the generated type tests which evaluates to the type to compare.
 */
export function toTypeString(prefix: string, typeData: TypeData, typePreprocessor: string) {
	const node = typeData.node;
	let typeParams: string | undefined;
	if (
		Node.isInterfaceDeclaration(node) ||
		Node.isTypeAliasDeclaration(node) ||
		Node.isClassDeclaration(node)
	) {
		// does the type take generics that don't have defaults?
		if (
			node.getTypeParameters().length > 0 &&
			node.getTypeParameters().some((tp) => tp.getDefault() === undefined)
		) {
			// it's really hard to build the right type for a generic,
			// so for now we'll just pass any, as it will always work
			// even though it may defeat the utility of a type or related test.
			typeParams = `<${node
				.getTypeParameters()
				.filter((tp) => tp.getDefault() === undefined)
				.map(() => "any")
				.join(",")}>`;
		}
	}

	const typeStringBase = `${prefix}.${typeData.name}${typeParams ?? ""}`;
	switch (node.getKind()) {
		case ts.SyntaxKind.VariableDeclaration:
		case ts.SyntaxKind.FunctionDeclaration:
		case ts.SyntaxKind.Identifier:
			// turn variables and functions into types
			return `${typePreprocessor}<typeof ${typeStringBase}>`;

		default:
			return `${typePreprocessor}<${typeStringBase}>`;
	}
}
