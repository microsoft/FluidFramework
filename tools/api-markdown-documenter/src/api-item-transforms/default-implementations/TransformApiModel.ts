/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItemKind, type ApiModel } from "@microsoft/api-extractor-model";

import { ParagraphNode, SectionNode, SpanNode } from "../../documentation-domain/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createTableWithHeading } from "../helpers/index.js";

/**
 * Default documentation transform for `Model` items.
 */
export function transformApiModel(
	apiModel: ApiModel,
	config: ApiItemTransformationConfiguration,
): SectionNode[] {
	if (apiModel.packages.length === 0) {
		// If no packages under model, print simple note.
		return [
			new SectionNode([
				new ParagraphNode([
					SpanNode.createFromPlainText("No packages discovered while parsing model.", {
						italic: true,
					}),
				]),
			]),
		];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.skipPackage(apiPackage),
	);

	// Render packages table
	const packagesTableSection = createTableWithHeading(
		{
			headingTitle: "Packages",
			itemKind: ApiItemKind.Package,
			items: filteredPackages,
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
