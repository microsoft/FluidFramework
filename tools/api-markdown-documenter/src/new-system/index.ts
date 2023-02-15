/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	ApiItemTransformationConfiguration,
	CreateChildContentSections,
	defaultApiItemTransformations,
	TransformApiItemWithChildren,
	TransformApiItemWithoutChildren,
} from "./api-item-transforms";

// We want to make sure the entirety of this domain is accessible.
// eslint-disable-next-line no-restricted-syntax
export * from "./documentation-domain";

export {
	renderDocument as renderDocumentAsMarkdown,
	renderNode as renderNodeAsMarkdown,
	renderNodes as renderNodesAsMarkdown,
} from "./markdown-renderer";

export { createDocuments, renderFiles } from "./MarkdownDocumenter";
