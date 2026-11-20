/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";

import { getEffectiveReleaseLevel, getFilteredParent } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

/**
 * Determines whether or not the specified API item should be excluded from documentation generation,
 * based on {@link ApiItemTransformationConfiguration.exclude} in terms of the item itself and its ancestry.
 */
export function isItemOrAncestorExcluded(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): boolean {
	let currentItem: ApiItem | undefined = apiItem;
	while (currentItem !== undefined) {
		if (config.exclude(currentItem)) {
			return true;
		}
		currentItem = getFilteredParent(currentItem);
	}
	return false;
}

/**
 * Determines whether or not the specified API item should have documentation generated for it.
 * Accounts for {@link DocumentationSuiteConfiguration.minimumReleaseLevel} and {@link DocumentationSuiteConfiguration.exclude}.
 *
 * @remarks
 *
 * If an item does not have its own release tag, it will inherit its release scope from its nearest ancestor.
 *
 * Items without an associated release tag (directly or in their ancestry) will always be included as a precaution.
 *
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @example Hierarchical inheritance
 *
 * Items with tagged ancestors inherit their release scope when one is not specified.
 * This includes class/interface members...
 *
 * ```typescript
 * // @public
 * export interface Foo {
 * 	// `@public` inherited from the interface
 * 	bar: string;
 * }
 * ```
 *
 * This also includes scopes like namespaces, which can add further hierarchy...
 *
 * ```typescript
 * // @public
 * export namespace Foo {
 * 	// `@public` inherited from the namespace
 * 	export interface Bar {
 * 		// `@public` inherited from the namespace
 * 		baz: string;
 * 	}
 * }
 * ```
 *
 * @public
 */
export function shouldItemBeIncluded(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): boolean {
	return (
		getEffectiveReleaseLevel(apiItem) >= config.minimumReleaseLevel &&
		!isItemOrAncestorExcluded(apiItem, config)
	);
}
