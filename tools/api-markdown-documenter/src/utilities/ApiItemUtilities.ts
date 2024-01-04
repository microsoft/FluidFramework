/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
	type ApiCallSignature,
	type ApiConstructSignature,
	type ApiConstructor,
	ApiDocumentedItem,
	type ApiEntryPoint,
	type ApiFunction,
	type ApiIndexSignature,
	type ApiItem,
	type ApiItemKind,
	type ApiMethod,
	type ApiMethodSignature,
	type ApiNamespace,
	ApiOptionalMixin,
	type ApiPackage,
	ApiParameterListMixin,
	ApiReadonlyMixin,
	ApiReleaseTagMixin,
	ApiStaticMixin,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { type DocSection, StandardTags } from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";
import { type Logger } from "../Logging";

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
 * Filters the provided list of API items based on the provided `kinds`.
 *
 * @param apiItems - The list of items being filtered.
 * @param kinds - The kinds of items to consider. An item is considered a match if it matches any kind in this list.
 *
 * @returns The filtered list of items.
 */
export function filterByKind(apiItems: readonly ApiItem[], kinds: ApiItemKind[]): ApiItem[] {
	return apiItems.filter((apiMember) => kinds.includes(apiMember.kind));
}

/**
 * Gets the release tag associated with the provided API item, if one exists.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The associated release tag, if it exists. Otherwise, `undefined`.
 *
 * @public
 */
export function getReleaseTag(apiItem: ApiItem): ReleaseTag | undefined {
	return ApiReleaseTagMixin.isBaseClassOf(apiItem) ? apiItem.releaseTag : undefined;
}

/**
 * Creates a string representation of the provided release tag.
 *
 * @remarks If `None`, this will return an empty string.
 */
export function releaseTagToString(releaseTag: ReleaseTag): string {
	// eslint-disable-next-line default-case
	switch (releaseTag) {
		case ReleaseTag.Alpha: {
			return "Alpha";
		}
		case ReleaseTag.Beta: {
			return "Beta";
		}
		case ReleaseTag.Internal: {
			return "Internal";
		}
		case ReleaseTag.Public: {
			return "Public";
		}
		case ReleaseTag.None: {
			return "";
		}
	}
}

/**
 * Gets any custom-tag comment blocks on the API item matching the provided tag name, if any.
 * Intended for use with tag types for which only multiple instances are allowed in a TSDoc comment (e.g.
 * {@link https://tsdoc.org/pages/tags/throws/ | @throws}).
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must start with `@`. See {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags}.
 *
 * @returns The list of comment blocks with the matching tag, if any. Otherwise, `undefined`.
 */
function getCustomBlockSectionsForMultiInstanceTags(
	apiItem: ApiItem,
	tagName: string,
): DocSection[] | undefined {
	if (!tagName.startsWith("@")) {
		throw new Error("Invalid TSDoc tag name. Tag names must start with `@`.");
	}
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.customBlocks !== undefined) {
		const defaultValueBlocks = apiItem.tsdocComment.customBlocks.filter(
			(block) => block.blockTag.tagName === tagName,
		);
		return defaultValueBlocks.map((block) => block.content);
	}
	return undefined;
}

/**
 * Gets the custom-tag comment block on the API item matching the provided tag name, if one is found.
 * Intended for use with tag types for which only 1 instance is allowed in a TSDoc comment (e.g.
 * {@link https://tsdoc.org/pages/tags/returns/ | @returns}).
 *
 * @remarks If multiple `@returns` comments are detected, this will log an error and return the first one it
 * encountered.
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must start with `@`. See {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags}.
 * @param config - See {@link ApiItemTransformationConfiguration}
 *
 * @returns The list of comment blocks with the matching tag, if any. Otherwise, `undefined`.
 */
function getCustomBlockSectionForSingleInstanceTag(
	apiItem: ApiItem,
	tagName: string,
	logger?: Logger,
): DocSection | undefined {
	const blocks = getCustomBlockSectionsForMultiInstanceTags(apiItem, tagName);
	if (blocks === undefined) {
		return undefined;
	}

	if (blocks.length > 1) {
		logger?.error(
			`API item ${apiItem.displayName} has multiple "${tagName}" comment blocks. This is not supported.`,
		);
	}

	return blocks[0];
}

/**
 * Gets any {@link https://tsdoc.org/pages/tags/example/ | @example} comment blocks from the API item if it has them.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@example` comment block sections, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getExampleBlocks(apiItem: ApiItem): DocSection[] | undefined {
	return getCustomBlockSectionsForMultiInstanceTags(apiItem, StandardTags.example.tagName);
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

/**
 * Gets any {@link https://tsdoc.org/pages/tags/throws/ | @throws} comment blocks from the API item, if it has them.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@throws` comment block sections, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getThrowsBlocks(apiItem: ApiItem): DocSection[] | undefined {
	return getCustomBlockSectionsForMultiInstanceTags(apiItem, StandardTags.throws.tagName);
}

/**
 * Gets the {@link https://tsdoc.org/pages/tags/defaultvalue/ | @defaultValue} comment block from the API item,
 * if it has one.
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param logger - Optional receiver of system log data.
 *
 * @returns The `@defaultValue` comment block section, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getDefaultValueBlock(apiItem: ApiItem, logger?: Logger): DocSection | undefined {
	return getCustomBlockSectionForSingleInstanceTag(
		apiItem,
		StandardTags.defaultValue.tagName,
		logger,
	);
}

/**
 * Gets the {@link https://tsdoc.org/pages/tags/returns/ | @returns} comment block from the API item if it has one.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@returns` comment block section, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getReturnsBlock(apiItem: ApiItem): DocSection | undefined {
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.returnsBlock !== undefined) {
		return apiItem.tsdocComment.returnsBlock.content;
	}
	return undefined;
}

/**
 * Gets the {@link https://tsdoc.org/pages/tags/deprecated/ | @deprecated} comment block from the API item if it has
 * one.
 *
 * @param apiItem - The API item whose documentation is being queried.
 *
 * @returns The `@deprecated` comment block section, if the API item has one. Otherwise, `undefined`.
 *
 * @public
 */
export function getDeprecatedBlock(apiItem: ApiItem): DocSection | undefined {
	return apiItem instanceof ApiDocumentedItem &&
		apiItem.tsdocComment?.deprecatedBlock !== undefined
		? apiItem.tsdocComment.deprecatedBlock.content
		: undefined;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as optional, and if it is
 * indeed optional.
 *
 * @public
 */
export function isDeprecated(apiItem: ApiItem): boolean {
	return (
		apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.deprecatedBlock !== undefined
	);
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as optional, and if it is
 * indeed optional.
 *
 * @public
 */
export function isOptional(apiItem: ApiItem): boolean {
	if (ApiOptionalMixin.isBaseClassOf(apiItem)) {
		return apiItem.isOptional;
	}
	return false;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as readonly, and if it is
 * indeed readonly.
 *
 * @public
 */
export function isReadonly(apiItem: ApiItem): boolean {
	if (ApiReadonlyMixin.isBaseClassOf(apiItem)) {
		return apiItem.isReadonly;
	}
	return false;
}

/**
 * Returns whether or not the provided API item is of a kind that can be marked as static, and if it is
 * indeed static.
 *
 * @public
 */
export function isStatic(apiItem: ApiItem): boolean {
	if (ApiStaticMixin.isBaseClassOf(apiItem)) {
		return apiItem.isStatic;
	}
	return false;
}

/**
 * Gets the {@link ApiModifier}s that apply to the provided API item.
 *
 * @param apiItem - The API item being queried.
 * @param modifiersToOmit - An optional list of modifier kinds to omit, even if they apply to the provided item.
 *
 * @public
 */
export function getModifiers(apiItem: ApiItem, modifiersToOmit?: ApiModifier[]): ApiModifier[] {
	const modifiers: ApiModifier[] = [];

	if (isOptional(apiItem) && !(modifiersToOmit?.includes(ApiModifier.Optional) ?? false)) {
		modifiers.push(ApiModifier.Optional);
	}

	if (isReadonly(apiItem) && !(modifiersToOmit?.includes(ApiModifier.Readonly) ?? false)) {
		modifiers.push(ApiModifier.Readonly);
	}

	if (isStatic(apiItem) && !(modifiersToOmit?.includes(ApiModifier.Static) ?? false)) {
		modifiers.push(ApiModifier.Static);
	}

	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		if (
			apiItem.tsdocComment.modifierTagSet.isVirtual() &&
			!(modifiersToOmit?.includes(ApiModifier.Virtual) ?? false)
		) {
			modifiers.push(ApiModifier.Virtual);
		}
		if (
			apiItem.tsdocComment.modifierTagSet.isSealed() &&
			!(modifiersToOmit?.includes(ApiModifier.Sealed) ?? false)
		) {
			modifiers.push(ApiModifier.Sealed);
		}
	}

	return modifiers;
}
