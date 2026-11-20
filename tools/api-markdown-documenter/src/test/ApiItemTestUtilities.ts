/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiInterface,
	type ApiItem,
	ApiMethodSignature,
	ApiPropertySignature,
	ApiTypeAlias,
	type Excerpt,
	ExcerptTokenKind,
	type IExcerptToken,
	type IExcerptTokenRange,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import type { DocComment } from "@microsoft/tsdoc";

/**
 * A fixture token supplied as plain text or as an API Extractor token.
 */
export type TestToken = string | IExcerptToken;

/**
 * An expression supplied to a test factory as one token or an ordered sequence of tokens.
 *
 * @remarks
 * A sequence can mix text and declaration references, as in a reference to `Box` followed by the text `<string>`.
 */
export type TestExpression = TestToken | readonly TestToken[];

/**
 * The default documentation comment and release tag for test API items.
 *
 * @remarks
 * Unless a fixture overrides these defaults, its declaration is public and has no documentation comment.
 */
const common = { docComment: undefined, releaseTag: ReleaseTag.Public };

/**
 * A zero-length token range for an omitted excerpt, such as a type parameter constraint or default.
 */
const emptyRange = { startIndex: 0, endIndex: 0 };

/**
 * Converts a test expression to an ordered array of API Extractor tokens.
 *
 * @remarks
 * Strings become content tokens. Explicit tokens pass through unchanged so their declaration references are preserved.
 */
function createTokens(expression: TestExpression): IExcerptToken[] {
	const tokens: readonly TestToken[] =
		typeof expression === "string" || "kind" in expression ? [expression] : expression;
	return tokens.map((token) =>
		typeof token === "string" ? { kind: ExcerptTokenKind.Content, text: token } : token,
	);
}

/**
 * Creates a token that links its displayed text to a canonical API declaration.
 */
export function createReferenceToken(text: string, canonicalReference: string): IExcerptToken {
	return { kind: ExcerptTokenKind.Reference, text, canonicalReference };
}

/**
 * Options for constructing a test interface with {@link createInterface}.
 */
export interface CreateInterfaceOptions {

	/**
	 * Maps type parameter names to their default type expressions in declaration order.
	 *
	 * @remarks
	 * Use `undefined` to declare a parameter without a default. Omit the option for a non-generic interface.
	 */
	readonly typeParameters?: Readonly<Record<string, TestExpression | undefined>>;

	/**
	 * The type expressions in the interface's `extends` clause, in declaration order.
	 */
	readonly bases?: readonly TestExpression[];

	/**
	 * The API items declared directly on the interface, excluding inherited members.
	 */
	readonly members?: readonly ApiItem[];

	/**
	 * The release tag assigned to the interface.
	 *
	 * @defaultValue `ReleaseTag.Public`
	 */
	readonly releaseTag?: ReleaseTag;
}

/**
 * Creates an interface with the specified type parameter defaults, bases, and members.
 *
 * @remarks
 * Each base expression has its own token range so a generic application such as `Box<string[]>`
 * is treated as one base even when its name and arguments are separate tokens.
 */
export function createInterface(
	name: string,
	options: CreateInterfaceOptions = {},
): ApiInterface {
	const excerptTokens = createTokens(`export interface ${name}`);
	function appendExpression(expression: TestExpression): IExcerptTokenRange {
		const startIndex = excerptTokens.length;
		excerptTokens.push(...createTokens(expression));
		return { startIndex, endIndex: excerptTokens.length };
	}
	const typeParameters = Object.entries(options.typeParameters ?? {}).map(
		([typeParameterName, defaultType], index) => {
			appendExpression(`${index === 0 ? "<" : ", "}${typeParameterName}`);
			if (defaultType !== undefined) {
				appendExpression(" = ");
			}
			return {
				typeParameterName,
				constraintTokenRange: emptyRange,
				defaultTypeTokenRange:
					defaultType === undefined ? emptyRange : appendExpression(defaultType),
			};
		},
	);
	if (typeParameters.length > 0) {
		appendExpression(">");
	}
	const extendsTokenRanges = (options.bases ?? []).map((base, index) => {
		appendExpression(index === 0 ? " extends " : ", ");
		return appendExpression(base);
	});
	return new ApiInterface({
		...common,
		name,
		isExported: true,
		releaseTag: options.releaseTag ?? ReleaseTag.Public,
		members: [...(options.members ?? [])],
		excerptTokens,
		typeParameters,
		extendsTokenRanges,
	});
}

/**
 * Options for constructing a test property signature with {@link createProperty}.
 */
export interface CreatePropertyOptions {

	/**
	 * The property's declared type expression.
	 *
	 * @defaultValue `"number"`
	 */
	readonly type?: TestExpression;

	/**
	 * The documentation comment attached to the property, if any.
	 */
	readonly documentComment?: DocComment;
}

/**
 * Creates a readonly property signature with the supplied type and optional documentation.
 */
export function createProperty(
	name: string,
	options: CreatePropertyOptions = {},
): ApiPropertySignature {
	const excerptTokens = createTokens(options.type ?? "number");
	return new ApiPropertySignature({
		...common,
		name,
		docComment: options.documentComment,
		isOptional: false,
		isReadonly: true,
		excerptTokens,
		propertyTypeTokenRange: { startIndex: 0, endIndex: excerptTokens.length },
	});
}

/**
 * Options for constructing a test method signature with {@link createMethod}.
 */
export interface CreateMethodOptions {

	/**
	 * The method's return type expression. Omit it for an empty return type excerpt.
	 */
	readonly returnType?: TestExpression;

	/**
	 * The names of the method's own type parameters, in declaration order.
	 */
	readonly typeParameters?: readonly string[];

	/**
	 * The one-based index of this signature among overloads of the same method.
	 *
	 * @defaultValue `1`
	 */
	readonly overloadIndex?: number;
}

/**
 * Creates a method signature with the specified return type, type parameters, and overload index.
 */
export function createMethod(
	name: string,
	options: CreateMethodOptions = {},
): ApiMethodSignature {
	const excerptTokens = createTokens(options.returnType ?? []);
	return new ApiMethodSignature({
		...common,
		name,
		isOptional: false,
		overloadIndex: options.overloadIndex ?? 1,
		parameters: [],
		typeParameters: (options.typeParameters ?? []).map((typeParameterName) => ({
			typeParameterName,
			constraintTokenRange: emptyRange,
			defaultTypeTokenRange: emptyRange,
		})),
		excerptTokens,
		returnTypeTokenRange: { startIndex: 0, endIndex: excerptTokens.length },
	});
}

/**
 * Creates a type alias whose right-hand side consists of the supplied tokens.
 */
export function createTypeAlias(name: string, ...tokens: TestToken[]): ApiTypeAlias {
	const excerptTokens = createTokens(tokens);
	return new ApiTypeAlias({
		...common,
		name,
		isExported: true,
		typeParameters: [],
		excerptTokens,
		typeTokenRange: { startIndex: 0, endIndex: excerptTokens.length },
	});
}

/**
 * Creates a standalone type excerpt from text and declaration references.
 */
export function createTypeExcerpt(...tokens: TestToken[]): Excerpt {
	return createProperty("value", { type: tokens }).propertyTypeExcerpt;
}
