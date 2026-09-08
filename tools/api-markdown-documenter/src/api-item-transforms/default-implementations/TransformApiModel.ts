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
	const filteredPackages = apiModel.packages.filter(
		(apiPackage) => !config.exclude(apiPackage),
	);

	if (filteredPackages.length === 0) {
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
