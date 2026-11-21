/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ApiItemLinkTarget,
	createQualifiedDocumentNameForApiItem,
	doesItemRequireOwnDocument,
	doesItemKindRequireOwnDocument,
	filterItems,
	type FilteredMembers,
	getFilteredMembers,
	getHeadingForApiItem,
	getLinkForApiItem,
	getLinkTargetForApiItem,
} from "./ApiItemTransformUtilities.js";
export { isItemOrAncestorExcluded, shouldItemBeIncluded } from "./ApiItemVisibility.js";
export { createDocument, checkForDuplicateDocumentPaths } from "./DocumentUtilities.js";
export { mdastToHtml } from "./HtmlUtilities.js";
export type { MemberType } from "./InheritedMemberTypes.js";
export { resolveSymbolicLink } from "./ReferenceUtilities.js";
