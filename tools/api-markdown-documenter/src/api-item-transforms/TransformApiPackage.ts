/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiPackage } from "@microsoft/api-extractor-model";

import { DocumentNode, SectionNode } from "../documentation-domain";
import { apiItemToSections } from "./TransformApiItem";
import { createDocument } from "./Utilities";
import { ApiItemTransformationConfiguration } from "./configuration";
import { createBreadcrumbParagraph, wrapInSection } from "./helpers";

/**
 * Creates a {@link DocumentNode} for the specified `apiPackage`.
 *
 * @param apiPackage - The package content to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function apiPackageToDocument(
	apiPackage: ApiPackage,
	config: Required<ApiItemTransformationConfiguration>,
): DocumentNode {
	const logger = config.logger;

	logger.verbose(`Generating ${apiPackage.name} package document...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (config.includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)]));
	}

	// Render body contents
	sections.push(
		...config.transformApiPackage(apiPackage, config, (childItem) =>
			apiItemToSections(childItem, config),
		),
	);

	logger.verbose(`Package document rendered successfully.`);

	return createDocument(apiPackage, sections, config);
}
