/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItemKind, type ApiModel } from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain/index.js";
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
				{
					type: "paragraph",
					children: [
						{
							type: "emphasis",
							children: [
								{
									type: "text",
									value: "No packages discovered while parsing model.",
								},
							],
						},
					],
				},
			]),
		];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.exclude(apiPackage),
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
