/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import { ReleaseTag, type ApiModel } from "@microsoft/api-extractor-model";

import { checkForDuplicateDocumentPaths } from "../api-item-transforms/index.js";
import { loadModel, transformApiModel, type ApiItemTransformationOptions } from "../index.js";

import { HierarchyConfigs, testDataDirectoryPath } from "./EndToEndTestUtilities.js";

const apiModels: string[] = ["simple-suite-test"];

const testConfigs = new Map<string, Omit<ApiItemTransformationOptions, "apiModel">>([
	[
		"default-config",
		{
			uriRoot: ".",
		},
	],

	// A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	[
		"flat-config",
		{
			uriRoot: "docs",
			includeBreadcrumb: true,
			includeTopLevelDocumentHeading: false,
			hierarchy: HierarchyConfigs.sparse,
			minimumReleaseLevel: ReleaseTag.Beta, // Only include `@public` and `beta` items in the docs suite
		},
	],

	// A sample "sparse" configuration, which renders every item kind to its own document.
	[
		"sparse-config",
		{
			uriRoot: "docs",
			includeBreadcrumb: false,
			includeTopLevelDocumentHeading: true,
			hierarchy: HierarchyConfigs.sparse,
			minimumReleaseLevel: ReleaseTag.Public, // Only include `@public` items in the docs suite
			skipPackage: (apiPackage) => apiPackage.name === "test-suite-b", // Skip test-suite-b package
		},
	],
]);

describe("API model transformation end-to-end tests", () => {
	for (const modelName of apiModels) {
		// Input directory for the model
		const modelDirectoryPath = Path.join(testDataDirectoryPath, modelName);

		describe(`API model: ${modelName}`, () => {
			let apiModel: ApiModel;
			before(async () => {
				apiModel = await loadModel({ modelDirectoryPath });
			});

			describe("Ensure no duplicate document paths", () => {
				for (const [configName, inputConfig] of testConfigs) {
					it(configName, async () => {
						const options: ApiItemTransformationOptions = {
							...inputConfig,
							apiModel,
						};

						const documents = transformApiModel(options);
						checkForDuplicateDocumentPaths(documents);
					});
				}
			});
		});
	}
});
