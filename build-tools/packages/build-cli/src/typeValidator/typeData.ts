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
export function toTypeString(
	prefix: string,
	typeData: TypeData,
	typePreprocessor: string,
): string {
	const { node } = typeData;
	let typeParams: string | undefined;
	if (
		!typeData.useTypeof &&
		(Node.isInterfaceDeclaration(node) ||
			Node.isTypeAliasDeclaration(node) ||
			Node.isClassDeclaration(node))
	) {
		// does the type take generics that don't have defaults?
		// eslint-disable-next-line unicorn/no-lonely-if -- logic is clearer when grouped this way.
		if (
			node
				.getTypeParameters()
				.some((typeParameter) => typeParameter.getDefault() === undefined)
		) {
			// In general there is no single correct value to test for the type parameters,
			// so for now we'll just pass `never`, as it will always be valid.
			// This may result in a type test with very little utility since most APIs aren't intended to be used with "never",
			// and doing so is unlikely to test most of the actual use-cases of the generic type.
			// `Never` is used instead of `any` since some contravariant generics constrain the input to `never`, and `any` is not assignable to `never`.
			typeParams = `<${node
				.getTypeParameters()
				.filter((typeParameter) => typeParameter.getDefault() === undefined)
				.map(() => "never")
				.join(",")}>`;
		}
	}

	const typeStringBase = `${prefix}.${typeData.name}${typeParams ?? ""}`;
	return `${typePreprocessor}<${typeData.useTypeof ? "typeof " : ""}${typeStringBase}>`;
}
