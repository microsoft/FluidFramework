/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiConstructSignature,
	type ApiConstructor,
	ApiDocumentedItem,
	type ApiEntryPoint,
	type ApiFunction,
	type ApiIndexSignature,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiMethodSignature,
	type ApiModel,
	type ApiNamespace,
	ApiOptionalMixin,
	type ApiPackage,
	ApiParameterListMixin,
	ApiReadonlyMixin,
	type ApiReleaseTagMixin,
	ApiStaticMixin,
	type Excerpt,
	type IResolveDeclarationReferenceResult,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import {
	type DocDeclarationReference,
	type DocSection,
	StandardTags,
	TSDocTagDefinition,
} from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";

import type { Logger } from "../Logging.js";

/**
 * This module contains general `ApiItem`-related types and utilities.
 * @remarks Note: the utilities here should not require any specific context or configuration.
 */

/**
 * Represents "valid" API item kinds. I.e., not `None`.
 *
 * @public
 */
export type ValidApiItemKind = Exclude<ApiItemKind, ApiItemKind.None>;

/**
 * Gets the {@link ValidApiItemKind} for the provided API item.
 *
 * @throws If the item's kind is "None".
 */
export function getApiItemKind(apiItem: ApiItem): ValidApiItemKind {
	switch (apiItem.kind) {
		case ApiItemKind.None: {
			throw new Error(`Encountered an API item with kind "None": "${apiItem.displayName}".`);
		}
		default: {
			return apiItem.kind;
		}
	}
}

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
export type ApiMemberKind = Exclude<
	ValidApiItemKind,
	ApiItemKind.EntryPoint | ApiItemKind.Model | ApiItemKind.Package
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
 * Gets the "filtered" parent of the provided API item.
 *
 * @remarks This logic specifically skips items of the following kinds:
 *
 * - EntryPoint: skipped because any given Package item will have exactly 1 EntryPoint child with current version of
 * API-Extractor, making this redundant in the hierarchy. We may need to revisit this in the future if/when
 * API-Extractor adds support for multiple entrypoints.
 *
 * @param apiItem - The API item whose filtered parent will be returned.
 */
export function getFilteredParent(apiItem: ApiItem): ApiItem | undefined {
	const parent = apiItem.parent;
	if (parent?.kind === ApiItemKind.EntryPoint) {
		return parent.parent;
	}
	return parent;
}

/**
 * Gets a qualified representation of the API item's display name, accounting for function/method overloads
 * by adding a suffix (such as "myMethod_2") as needed to guarantee uniqueness.
 */
function getQualifiedDisplayName(apiItem: ApiItem): string {
	let qualifiedName: string = apiItem.displayName;
	if (ApiParameterListMixin.isBaseClassOf(apiItem) && apiItem.overloadIndex > 1) {
		// Subtract one for compatibility with earlier releases of API Documenter.
		// (This will get revamped when we fix GitHub issue #1308)
		qualifiedName += `_${apiItem.overloadIndex - 1}`;
	}
	return qualifiedName;
}

/**
 * Gets a filename-safe representation of the provided API item name.
 *
 * @remarks
 * - Handles invalid filename characters.
 */
export function getFileSafeNameForApiItemName(apiItemName: string): string {
	// eslint-disable-next-line unicorn/better-regex, no-useless-escape
	const badFilenameCharsRegExp: RegExp = /[^a-z0-9_\-\.]/gi;

	// Note: This can introduce naming collisions.
	// TODO: once the following issue has been resolved in api-extractor, we may be able to clean this up:
	// https://github.com/microsoft/rushstack/issues/1308
	return apiItemName.replace(badFilenameCharsRegExp, "_").toLowerCase();
}

/**
 * Gets a filename-safe representation of the API item's display name.
 *
 * @remarks
 * - Handles invalid filename characters.
 *
 * - Qualifies the API item's name, accounting for function/method overloads by adding a suffix (such as "myMethod_2")
 * as needed to guarantee uniqueness.
 *
 * @param apiItem - The API item for which the qualified name is being queried.
 *
 * @public
 */
export function getFileSafeNameForApiItem(apiItem: ApiItem): string {
	const qualifiedDisplayName = getQualifiedDisplayName(apiItem);
	return getFileSafeNameForApiItemName(qualifiedDisplayName);
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
 * Gets the release tag associated with the provided API item, if the item's documentation contained one.
 *
 * @returns The associated release tag, if it exists. Will return `None` if no tag is present.
 *
 * @privateRemarks
 * TODO: No one should really use this. They should use `getEffectiveReleaseTag` instead.
 * This includes the docs we generate - we shouldn't label an interface member as `@public` if the interface itself is
 * `@beta`, for example, even if that member is directly tagged `@public`.
 *
 * @public
 */
export function getReleaseTag(apiItem: ApiItem): ReleaseTag {
	return (apiItem as Partial<ApiReleaseTagMixin>).releaseTag ?? ReleaseTag.None;
}

/**
 * Represents the release level of an API item.
 *
 * @remarks
 * The release level of a given item is the most restrictive of all items in its ancestry.
 * An item with no release tag is implicitly considered `Public`.
 *
 * @example
 *
 * An interface tagged `@public` under a namespace tagged `@beta` would be considered `@beta`.
 *
 * By contrast, an interface tagged `@beta` under a namespace tagged `@public` would also be considered `@beta`.
 *
 * @public
 */
export type ReleaseLevel = Exclude<ReleaseTag, ReleaseTag.None>;

/**
 * Gets the effective {@link ReleaseLevel | release level} for the provided API item.
 *
 * @public
 */
export function getEffectiveReleaseLevel(apiItem: ApiItem): ReleaseLevel {
	let myReleaseTag = getReleaseTag(apiItem);
	if (myReleaseTag === ReleaseTag.None) {
		// The lack of a release tag is treated as public
		myReleaseTag = ReleaseTag.Public;
	}

	const parent = getFilteredParent(apiItem);
	if (parent === undefined) {
		return myReleaseTag;
	}

	const parentEffectiveReleaseTag = getEffectiveReleaseLevel(parent);
	return Math.min(myReleaseTag, parentEffectiveReleaseTag);
}

/**
 * Gets all {@link https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags | modifier tags} associated with the provided API item.
 *
 * @remarks Note that this will include both standard and any preserved custom tags.
 *
 * @public
 */
export function getModifierTags(apiItem: ApiItem): ReadonlySet<string> {
	const modifierTags = new Set<string>();
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		for (const tag of apiItem.tsdocComment.modifierTagSet.nodes) {
			modifierTags.add(tag.tagName);
		}
	}
	return modifierTags;
}

/**
 * Checks if the provided API item is tagged with the specified {@link https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags | modifier tag}.
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must be a valid TSDoc tag (including starting with `@`).
 *
 * @throws If the provided TSDoc tag name is invalid.
 *
 * @public
 */
export function hasModifierTag(apiItem: ApiItem, tagName: string): boolean {
	TSDocTagDefinition.validateTSDocTagName(tagName);
	return getModifierTags(apiItem).has(tagName);
}

/**
 * Checks if the provided API item or any ancestors is tagged with the specified
 * {@link https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags | modifier tag}.
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must be a valid TSDoc tag (including starting with `@`).
 *
 * @throws If the provided TSDoc tag name is invalid.
 *
 * @public
 */
export function ancestryHasModifierTag(apiItem: ApiItem, tagName: string): boolean {
	if (hasModifierTag(apiItem, tagName)) {
		return true;
	}

	const parent = getFilteredParent(apiItem);
	return parent !== undefined && ancestryHasModifierTag(parent, tagName);
}

/**
 * Gets all custom {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags | block comments} associated with the provided API item.
 * @returns A mapping from tag name to the associated block contents.
 *
 * @public
 */
export function getCustomBlockComments(
	apiItem: ApiItem,
): ReadonlyMap<string, readonly DocSection[]> {
	const customBlockComments = new Map<string, DocSection[]>();
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.customBlocks !== undefined) {
		for (const block of apiItem.tsdocComment.customBlocks) {
			let sections = customBlockComments.get(block.blockTag.tagName);
			if (sections === undefined) {
				sections = [];
				customBlockComments.set(block.blockTag.tagName, sections);
			}
			sections.push(block.content);
		}
	}
	return customBlockComments;
}

/**
 * Gets any custom-tag comment blocks on the API item matching the provided tag name, if any.
 * Intended for use with tag types for which only multiple instances are allowed in a TSDoc comment (e.g.
 * {@link https://tsdoc.org/pages/tags/throws/ | @throws}).
 *
 * @param apiItem - The API item whose documentation is being queried.
 * @param tagName - The TSDoc tag name being queried for.
 * Must be a valid TSDoc tag (including starting with `@`).
 * See {@link https://tsdoc.org/pages/spec/tag_kinds/#block-tags}.
 *
 * @throws If the provided TSDoc tag name is invalid.
 *
 * @returns The list of comment blocks with the matching tag, if any. Otherwise, `undefined`.
 */
function getCustomBlockSectionsForMultiInstanceTags(
	apiItem: ApiItem,
	tagName: string,
): readonly DocSection[] | undefined {
	TSDocTagDefinition.validateTSDocTagName(tagName);
	const allBlocks = getCustomBlockComments(apiItem);
	return allBlocks.get(tagName);
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
export function getExampleBlocks(apiItem: ApiItem): readonly DocSection[] | undefined {
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
export function getSeeBlocks(apiItem: ApiItem): readonly DocSection[] | undefined {
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
export function getThrowsBlocks(apiItem: ApiItem): readonly DocSection[] | undefined {
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
 * Returns whether or not the provided API item is tagged as `@deprecated`.
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

/**
 * Generates a concise signature for a function.  Example: "getArea(width, height)"
 */
export function getConciseSignature(apiItem: ApiItem): string {
	if (ApiParameterListMixin.isBaseClassOf(apiItem)) {
		return `${apiItem.displayName}(${apiItem.parameters.map((x) => x.name).join(", ")})`;
	}
	return apiItem.displayName;
}

/**
 * Extracts the text from the provided excerpt and adjusts it to be on a single line.
 *
 * @remarks
 * Useful when a shortened version of a code excerpt is wanted, or if you don't want code formatting to affect
 * the presentation in the documentation.
 * This is especially valuable if the contents need to fit on a single line.
 *
 * @example
 * An excerpt of TypeScript code like...
 *
 * ```typescript
 * export interface Foo {
 * 	bar: string;
 * 	baz: number;
 * }
 * ```
 *
 * would become...
 *
 * ```typescript
 *  export interface Foo { bar: string; baz: number; }
 * ```
 *
 * @public
 */
export function getSingleLineExcerptText(excerpt: Excerpt): string {
	// Regex replaces line breaks with spaces to ensure everything ends up on a single line.
	return excerpt.text.trim().replace(/\s+/g, " ");
}

/**
 * Resolves a symbolic link and creates a URL to the target.
 *
 * @param contextApiItem - See {@link TsdocNodeTransformOptions.contextApiItem}.
 * @param codeDestination - The link reference target.
 * @param apiModel - The API model to which the API item and destination belong.
 *
 * @throws If the reference cannot be resolved.
 */
export function resolveSymbolicReference(
	contextApiItem: ApiItem,
	codeDestination: DocDeclarationReference,
	apiModel: ApiModel,
): ApiItem {
	const resolvedReference: IResolveDeclarationReferenceResult =
		apiModel.resolveDeclarationReference(codeDestination, contextApiItem);

	const resolvedApiItem = resolvedReference.resolvedApiItem;
	if (resolvedApiItem === undefined) {
		throw new Error(
			`Unable to resolve reference "${codeDestination.emitAsTsdoc()}" from "${getScopedMemberNameForDiagnostics(
				contextApiItem,
			)}": ${resolvedReference.errorMessage}`,
		);
	}

	return resolvedApiItem;
}

/**
 * Creates a scoped member specifier for the provided API item, including the name of the package the item belongs to
 * if applicable.
 *
 * Intended for use in diagnostic messaging.
 */
export function getScopedMemberNameForDiagnostics(apiItem: ApiItem): string {
	return apiItem.kind === ApiItemKind.Package
		? (apiItem as ApiPackage).displayName
		: `${
				apiItem.getAssociatedPackage()?.displayName ?? "<NO-PACKAGE>"
		  }#${apiItem.getScopedNameWithinPackage()}`;
}
