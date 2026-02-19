/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createQualifiedDocumentNameForApiItem,
	doesItemKindRequireOwnDocument,
	doesItemRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	isItemOrAncestorExcluded,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export { checkForDuplicateDocumentPaths, createDocument } from "./DocumentUtilities.js";
export { mdastToHtml } from "./HtmlUtilities.js";
export { resolveSymbolicLink } from "./ReferenceUtilities.js";
