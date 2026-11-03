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
	getHeadingForApiItem,
	getLinkForApiItem,
	getLinkTargetForApiItem,
	isItemOrAncestorExcluded,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export { createDocument, checkForDuplicateDocumentPaths } from "./DocumentUtilities.js";
export { mdastToHtml } from "./HtmlUtilities.js";
export { resolveSymbolicLink } from "./ReferenceUtilities.js";
