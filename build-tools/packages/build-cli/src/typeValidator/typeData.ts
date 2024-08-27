/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node } from "ts-morph";

export interface TypeData {
	/**
	 * Includes namespace prefix if needed.
	 */
	readonly name: string;
	/**
	 * Test case name.
	 * Uniquely identifies a test case with a string safe to use as an identifier.
	 * Consists of a non-colliding "mangled" identifier for the type.
	 */
	readonly testCaseName: string;
	readonly node: Node;
	readonly tags: ReadonlySet<string>;
	/**
	 * Indicates if this TypeData refer to the named item (false), or the typeof the named item (true).
	 * This is particularly relevant with classes which can have both.
	 */
	readonly useTypeof: boolean;
}

/**
 * Generate an expression to include into the generated type tests which evaluates to the type to compare.
 */
export function toTypeString(prefix: string, typeData: TypeData, typePreprocessor: string) {
	const node = typeData.node;
	let typeParams: string | undefined;
	if (
		!typeData.useTypeof &&
		(Node.isInterfaceDeclaration(node) ||
			Node.isTypeAliasDeclaration(node) ||
			Node.isClassDeclaration(node))
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
	return `${typePreprocessor}<${typeData.useTypeof ? "typeof " : ""}${typeStringBase}>`;
}
