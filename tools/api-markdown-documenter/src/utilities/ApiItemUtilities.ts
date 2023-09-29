/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
	ApiCallSignature,
	ApiConstructSignature,
	ApiConstructor,
	ApiDocumentedItem,
	ApiEntryPoint,
	ApiFunction,
	ApiIndexSignature,
	ApiItem,
	ApiItemKind,
	ApiMethod,
	ApiMethodSignature,
	ApiNamespace,
	ApiPackage,
	ApiParameterListMixin,
} from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";

/**
 * This module contains general `ApiItem`-related types and utilities.
 */

/**
 * Represents "member" API item kinds.
 * These are the kinds of items the system supports generally for rendering, file-system configuration, etc.
 *
 * @remarks This type explicitly excludes the following API item kinds represented in API-Extractor models:
 *
 * - `None`
 *
 * - `EntryPoint`
 *
 * - `Model`
 *
 * - `Package`
 *
 * @public
 */
export type ApiMemberKind = Omit<
	ApiItemKind,
	ApiItemKind.EntryPoint | ApiItemKind.Model | ApiItemKind.None | ApiItemKind.Package
>;

/**
 * `ApiItem` union type representing function-like API kinds.
 *
 * @public
 */
export type ApiFunctionLike =
	| ApiConstructSignature
	| ApiConstructor
	| ApiFunction
	| ApiMethod
	| ApiMethodSignature;

/**
 * `ApiItem` union type representing call-signature-like API kinds.
 *
 * @public
 */
export type ApiSignatureLike = ApiCallSignature | ApiIndexSignature;

/**
 * `ApiItem` union type representing module-like API kinds.
 *
 * @public
 */
export type ApiModuleLike = ApiEntryPoint | ApiNamespace;

/**
 * Represents an API item modifier.
 *
 * @public
 */
export enum ApiModifier {
	/**
	 * Indicates an `optional` parameter or property.
	 */
	Optional = "optional",

	/**
	 * Indicates a `readonly` parameter or property.
	 */
	Readonly = "readonly",

	/**
	 * Indicates a `static` member of a `class` or `interface`.
	 */
	Static = "static",

	/**
	 * Indicates that the API item has been annotated with the {@link https://tsdoc.org/pages/tags/virtual | @virtual}
	 * tag. This item is intended to be overridden by implementing types.
	 */
	Virtual = "virtual",

	/**
	 * Indicates that the API item has been annotated with the {@link https://tsdoc.org/pages/tags/sealed | @sealed}
	 * tag. This item may not to be overridden by implementing types.
	 */
	Sealed = "sealed",
}

/**
 * Adjusts the name of the item as needed.
 * Accounts for method overloads by adding a suffix such as "myMethod_2".
 *
 * @param apiItem - The API item for which the qualified name is being queried.
 *
 * @public
 */
export function getQualifiedApiItemName(apiItem: ApiItem): string {
	let qualifiedName: string = Utilities.getSafeFilenameForName(apiItem.displayName);
	if (ApiParameterListMixin.isBaseClassOf(apiItem) && apiItem.overloadIndex > 1) {
		// Subtract one for compatibility with earlier releases of API Documenter.
		// (This will get revamped when we fix GitHub issue #1308)
		qualifiedName += `_${apiItem.overloadIndex - 1}`;
	}
	return qualifiedName;
}

/**
 * Gets the unscoped version of the provided package's name.
 *
 * @example
 *
 * For the package `@foo/bar`, this would return `bar`.
 *
 * @public
 */
export function getUnscopedPackageName(apiPackage: ApiPackage): string {
	return PackageName.getUnscopedName(apiPackage.displayName);
}

/**
 * Gets any {@link https://tsdoc.org/pages/tags/see/ | @see} comment blocks from the API item, if it has them.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@see` comment block section, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getSeeBlocks(apiItem: ApiItem): DocSection[] | undefined {
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.seeBlocks !== undefined) {
		const seeBlocks = apiItem.tsdocComment.seeBlocks.map((block) => block.content);
		return seeBlocks.length === 0 ? undefined : seeBlocks;
	}
	return undefined;
}
