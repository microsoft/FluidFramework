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
	isItemOrAncestorExcluded,
	shouldItemBeIncluded,
} from "./ApiItemTransformUtilities.js";
export { createDocument, checkForDuplicateDocumentPaths } from "./DocumentUtilities.js";
export {
	getTypeMembers,
	type TypeMember,
} from "./InheritanceUtilities.js";
export { resolveSymbolicLink } from "./ReferenceUtilities.js";
