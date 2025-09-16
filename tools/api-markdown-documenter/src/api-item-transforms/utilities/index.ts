/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createQualifiedDocumentNameForApiItem,
	doesItemRequireOwnDocument,
	doesItemKindRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	getTypeMembers,
	isItemOrAncestorExcluded,
	shouldItemBeIncluded,
	type TypeMember,
} from "./ApiItemTransformUtilities.js";
export { createDocument, checkForDuplicateDocumentPaths } from "./DocumentUtilities.js";
export { resolveSymbolicLink } from "./ReferenceUtilities.js";
