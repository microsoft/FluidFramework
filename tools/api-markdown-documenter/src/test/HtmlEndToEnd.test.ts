/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import {
	ApiItemKind,
	ReleaseTag,
	type ApiModel,
	type ApiPackage,
} from "@microsoft/api-extractor-model";

import { HtmlRenderer, loadModel } from "../index.js";

import {
	compareDocumentationSuiteSnapshot,
	HierarchyConfigurations,
	snapshotsDirectoryPath as snapshotsDirectoryPathBase,
	testDataDirectoryPath,
	testTemporaryDirectoryPath as testTemporaryDirectoryPathBase,
} from "./EndToEndTestUtilities.js";

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTemporaryDirectoryPath = Path.resolve(testTemporaryDirectoryPathBase, "html");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to lib/test
 */
const snapshotsDirectoryPath = Path.resolve(snapshotsDirectoryPathBase, "html");

const apiModels: string[] = ["simple-suite-test"];

const testConfigs = new Map<
	string,
	Omit<HtmlRenderer.RenderApiModelOptions, "apiModel" | "outputDirectoryPath">
>([
	[
		"default-config",
		{
			uriRoot: "",
		},
	],

	// A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	[
		"flat-config",
		{
			uriRoot: "docs",
			includeBreadcrumb: true,
			includeTopLevelDocumentHeading: false,
			hierarchy: HierarchyConfigurations.flat,
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
			hierarchy: HierarchyConfigurations.sparse,
			minimumReleaseLevel: ReleaseTag.Public, // Only include `@public` items in the docs suite
			exclude: (apiItem) =>
				// Skip test-suite-b package
				apiItem.kind === ApiItemKind.Package &&
				(apiItem as ApiPackage).name === "test-suite-b",
			startingHeadingLevel: 2,
		},
	],

	// A sample "deep" configuration.
	// All "parent" API items generate hierarchy.
	// All other items are rendered as documents under their parent hierarchy.
	[
		"deep-config",
		{
			hierarchy: HierarchyConfigurations.deep,
		},
	],
]);

describe("HTML end-to-end tests", () => {
	for (const modelName of apiModels) {
		// Input directory for the model
		const modelDirectoryPath = Path.join(testDataDirectoryPath, modelName);

		describe(`API model: ${modelName}`, () => {
			let apiModel: ApiModel;
			before(async () => {
				apiModel = await loadModel({ modelDirectoryPath });
			});

			for (const [configName, inputConfig] of testConfigs) {
				const temporaryOutputPath = Path.join(
					testTemporaryDirectoryPath,
					modelName,
					configName,
				);
				const snapshotPath = Path.join(snapshotsDirectoryPath, modelName, configName);

				it(configName, async () => {
					const options: HtmlRenderer.RenderApiModelOptions = {
						...inputConfig,
						apiModel,
						outputDirectoryPath: temporaryOutputPath,
					};

					await HtmlRenderer.renderApiModel(options);

					await compareDocumentationSuiteSnapshot(snapshotPath, temporaryOutputPath);
				});
			}
		});
	}
});
