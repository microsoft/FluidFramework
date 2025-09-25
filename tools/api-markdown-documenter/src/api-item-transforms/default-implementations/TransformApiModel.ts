/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiModel } from "@microsoft/api-extractor-model";

import type { Section } from "../../mdast/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createPackagesTable } from "../helpers/index.js";

/**
 * Default documentation transform for `Model` items.
 */
export function transformApiModel(
	apiModel: ApiModel,
	config: ApiItemTransformationConfiguration,
): Section[] {
	if (apiModel.packages.length === 0) {
		// If no packages under model, print simple note.
		return [
			{
				type: "section",
				children: [
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
				],
			},
		];
	}

	// Filter out packages not wanted per user config
	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.exclude(apiPackage),
	);

	// Render packages table
	const packagesTable = createPackagesTable(filteredPackages, config);

	if (packagesTable === undefined) {
		throw new Error(
			"No table rendered for non-empty package list. This indicates an internal error.",
		);
	}

	return [
		{
			type: "section",
			heading: { type: "sectionHeading", title: "Packages" },
			children: [packagesTable],
		} satisfies Section,
	];
}
