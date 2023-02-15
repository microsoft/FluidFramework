/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../../Configuration";
import {
	HierarchicalSectionNode,
	ParagraphNode,
	createSingleLineSpanFromPlainText,
} from "../../documentation-domain";
import { createTableWithHeading } from "../helpers";

/**
 * Default policy for rendering doc sections for `Model` items.
 */
export function transformApiModel(
	apiModel: ApiModel,
	config: Required<MarkdownDocumenterConfiguration>,
): HierarchicalSectionNode[] {
	if (apiModel.packages.length === 0) {
		// If no packages under model, print simple note.
		return [
			new HierarchicalSectionNode([
				new ParagraphNode([
					createSingleLineSpanFromPlainText(
						"No packages discovered while parsing model.",
						{
							italic: true,
						},
					),
				]),
			]),
		];
	}

	// Render packages table
	const packagesTableSection = createTableWithHeading(
		{
			headingTitle: "Packages",
			itemKind: ApiItemKind.Package,
			items: apiModel.packages,
		},
		config,
	);

	if (packagesTableSection === undefined) {
		throw new Error(
			"No table rendered for non-empty package list. This indicates an internal error.",
		);
	}

	return [packagesTableSection];
}
