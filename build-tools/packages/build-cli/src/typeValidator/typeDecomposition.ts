/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type, TypeChecker } from "ts-morph";

export interface DecompositionResult {
	/**
	 * The decomposed type with external types replaced with strings
	 */
	typeAsString: string;
	/**
	 * External types that have been replaced
	 */
	replacedTypes: Set<string>;
	/**
	 * Generic classes that are required for the class because
	 * they can't be replaced without disrupting type structure
	 * Mapping is name to number of type params
	 */
	requiredGenerics: GenericsInfo;
}

/**
 * Class to track information on generic classes found during type decomposition
 * Actual breaking change detection of those classes is handled where they are
 * exported
 */
export class GenericsInfo extends Map<string, number> {
	// TODO: add TS built-ins
	// Should this check for the type in the imports/rest of file instead?  Seems
	// kind of difficult given the different import methods, re-exports, etc.
	static builtIns: string[] = ["Array", "Promise", "Map", "Set"];
	set(key: string, value: number): this {
		if (GenericsInfo.builtIns.includes(key)) {
			return this;
		}

		const oldValue = this.get(key) ?? 0;
		return super.set(key, Math.max(value, oldValue));
	}

	merge(from: Map<string, number>): void {
		for (const [k, v] of from.entries()) {
			this.set(k, v);
		}
	}
}

/**
 * Merge multiple DecompositionResults where the types as strings are concatentated with the
 * separator and extracted types sets are merged
 */
function mergeResults(
	into: Partial<DecompositionResult>,
	from: DecompositionResult,
	separator: string,
): void {
	if (into.typeAsString === undefined) {
		into.typeAsString = from.typeAsString;
		into.replacedTypes = from.replacedTypes;
		into.requiredGenerics = from.requiredGenerics;
	} else {
		into.typeAsString = `${into.typeAsString}${separator}${from.typeAsString}`;
		for (const v of from.replacedTypes) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			into.replacedTypes!.add(v);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		into.requiredGenerics!.merge(from.requiredGenerics);
	}
}

/**
 * Get the string name of a type without needing to worry about if it's a primitive, an imported
 * type, etc. (ts-morph doesn't expose this fn on TypeChecker and it gets verbose to use inline)
 * @param typeChecker - TypeChecker object from the type's TS project to get the type string
 * @param type - Type node to get string representation
 * @returns The type as a string
 */
export function typeToString(typeChecker: TypeChecker, type: Type): string {
	return typeChecker.compilerObject.typeToString(type.compilerType);
}

/**
 * Break down a complex type to extract its constituents, then reconstruct it with type -\> string
 * replacement, e.g. `Promise<UncomparableClass | OtherClass>` -\>
 * `Promise<"UncomparableClass" | "OtherClass">`
 * This removes external dependencies from the type while preserving its structure, where those
 * external types can be checked separately.  Structure must be preserved to check back-compat.
 *
 * TODO: handle multiple type args/params in result output
 * TODO: handle type constraints
 * TODO: handle conditional types
 * TODO: handle inline object types
 * TODO: handle tuple types
 * TODO: handle default values
 * TODO: handle index types, splat, rest
 * @param checker - The TypeChecker object from the node's TS project for getting type names
 * @param node - The type node to decompose
 * @returns DecompositionResult for the type
 */
export function decomposeType(checker: TypeChecker, node: Type): DecompositionResult {
	const result = {
		typeAsString: typeToString(checker, node),
		replacedTypes: new Set<string>(),
		requiredGenerics: new GenericsInfo(),
	};

	// don't try to decompose literals because they don't need to be converted to strings
	// booleans because they are a union of false | true but not aliased
	// (the enum/boolean checks don't actually catch when they're unioned with another
	// type but it also doesn't really matter for type checking...)
	if (node.isLiteral() || node.isBoolean()) {
		return result;
	}
	// don't try to decompose aliases because they are handled at their declaration
	// enums because they are unions that don't need to be decomposed
	// these still need to be converted to strings because they are defined symbols
	// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
	if (node.getAliasSymbol() || node.isEnum()) {
		result.typeAsString = `"${result.typeAsString}"`;
	}

	// type parameters can't be string literals and should not be replaced
	if (node.isTypeParameter()) {
		return result;
	}

	// intersections bind more strongly than unions so split those second
	if (node.isUnion()) {
		return decomposeTypes(checker, node.getUnionTypes(), " | ");
	}

	if (node.isIntersection()) {
		return decomposeTypes(checker, node.getIntersectionTypes(), " & ");
	}

	// handle type args/generics
	const typeArgs = node.getTypeArguments();
	if (typeArgs.length > 0) {
		// Array shorthand (type[]) is handled by type arguments
		const typeArgsResult = decomposeTypes(checker, typeArgs, ", ");
		const symbolName = checker.compilerObject.symbolToString(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			node.compilerType.getSymbol()!,
		);
		typeArgsResult.requiredGenerics.set(symbolName, typeArgs.length);
		typeArgsResult.typeAsString = `${symbolName}<${typeArgsResult.typeAsString}>`;
		return typeArgsResult;
	}
	result.typeAsString = `"${result.typeAsString}"`;
	return result;
}

/**
 * Decompose multiple types, concatenate their type as string results using the provided
 * separator, and merge their external type lists
 * @param checker - The TypeChecker object from the node's TS project for getting type names
 * @param nodes - The type nodes to decompose
 * @param separator - String separator used to merge the results of the decomposition
 * @returns Combined DecompositionResult for the types
 */
export function decomposeTypes(
	checker: TypeChecker,
	nodes: Type[],
	separator: string,
): DecompositionResult {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const result = {} as DecompositionResult;
	// eslint-disable-next-line array-callback-return
	nodes.map((t) => {
		const subResult = decomposeType(checker, t);
		mergeResults(result, subResult, separator);
	});
	return result;
}
