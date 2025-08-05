/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import {
	type ApiFunction,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	ApiModel,
	type ApiNamespace,
	type ApiVariable,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { ApiDocument } from "../../ApiDocument.js";
import {
	type DocumentationNode,
	HeadingNode,
	SectionNode,
} from "../../documentation-domain/index.js";
import { getHeadingForApiItem } from "../ApiItemTransformUtilities.js";
import { apiItemToSections } from "../TransformApiItem.js";
import { transformApiModel } from "../TransformApiModel.js";
import {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	getApiItemTransformationConfigurationWithDefaults,
} from "../configuration/index.js";
import { betaWarningSpan, wrapInSection } from "../helpers/index.js";

/**
 * Sample "default" configuration.
 */
const defaultPartialConfig: Omit<ApiItemTransformationOptions, "apiModel"> = {
	uriRoot: "",
};

// Relative to lib/api-item-transforms/test
const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testDataDirectoryPath = Path.resolve(
	dirname,
	"..",
	"..",
	"..",
	"src",
	"api-item-transforms",
	"test",
	"test-data",
);

/**
 * Generates an `ApiModel` from the API report file at the provided path.
 */
function generateModel(testReportFileName: string): ApiModel {
	const filePath = Path.resolve(testDataDirectoryPath, testReportFileName);

	const apiModel = new ApiModel();
	apiModel.loadPackage(filePath);

	return apiModel;
}

/**
 * Gets the API items from the provided `ApiModel`.
 * Assumes that the model has a single package with a single entry-point.
 */
function getApiItems(apiModel: ApiModel): readonly ApiItem[] {
	const packages = apiModel.packages;
	expect(packages.length).to.equal(1);

	const entryPoints = packages[0].entryPoints;
	expect(entryPoints.length).to.equal(1);

	return entryPoints[0].members;
}

/**
 * Gets the API item with the specified name and kind from the provided list.
 * Fails if a match is not found.
 */
function findApiMember(
	members: readonly ApiItem[],
	memberName: string,
	expectedKind: ApiItemKind,
): ApiItem {
	for (const member of members) {
		if (member.displayName === memberName && member.kind === expectedKind) {
			return member;
		}
	}
	expect.fail(
		`Item with name "${memberName}" and kind "${expectedKind}" not found in provided list.`,
	);
}

/**
 * Creates a config for testing.
 */
function createConfig(
	partialConfig: Omit<ApiItemTransformationOptions, "apiModel">,
	apiModel: ApiModel,
): ApiItemTransformationConfiguration {
	return getApiItemTransformationConfigurationWithDefaults({
		...partialConfig,
		apiModel,
	});
}

describe("ApiItem to Documentation transformation tests", () => {
	it("Transform ApiVariable", () => {
		const model = generateModel("test-variable.json");
		const members = getApiItems(model);
		const apiVariable = findApiMember(
			members,
			"TestConst",
			ApiItemKind.Variable,
		) as ApiVariable;

		const config = createConfig(defaultPartialConfig, model);

		const result = config.transformations[ApiItemKind.Variable](apiVariable, config);

		const expected = [
			wrapInSection(
				[
					wrapInSection([
						{
							type: "paragraph",
							children: [{ type: "text", value: "Test Constant" }],
						},
					]),
					wrapInSection(
						[
							{
								type: "code",
								lang: "typescript",
								value: 'TestConst = "Hello world!"',
							},
						],
						{
							title: "Signature",
							id: `testconst-signature`,
						},
					),
				],
				getHeadingForApiItem(apiVariable, config),
			),
		];

		expect(result).deep.equals(expected);
	});

	it("Transform ApiFunction", () => {
		const model = generateModel("test-function.json");
		const members = getApiItems(model);
		const apiFunction = findApiMember(
			members,
			"testFunction",
			ApiItemKind.Function,
		) as ApiFunction;

		const config = createConfig(defaultPartialConfig, model);

		const result = config.transformations[ApiItemKind.Function](apiFunction, config);

		const expected = [
			wrapInSection(
				[
					// Summary section
					wrapInSection([
						{
							type: "paragraph",
							children: [{ type: "text", value: "Test function" }],
						},
					]),

					// Signature section
					wrapInSection(
						[
							{
								type: "code",
								lang: "typescript",
								value:
									"export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;",
							},
							new SectionNode(
								[
									{
										type: "table",
										children: [
											{
												type: "tableRow",
												children: [
													{
														type: "tableCell",
														children: [{ type: "text", value: "Parameter" }],
													},
													{
														type: "tableCell",
														children: [{ type: "text", value: "Description" }],
													},
												],
											},
											{
												type: "tableRow",
												children: [
													{
														type: "tableCell",
														children: [{ type: "text", value: "TTypeParameter" }],
													},
													{
														type: "tableCell",
														children: [{ type: "text", value: "A test type parameter" }],
													},
												],
											},
										],
									},
								],
								new HeadingNode("Type Parameters"),
							),
						],
						{
							title: "Signature",
							id: `testfunction-signature`,
						},
					),

					// Parameters table section
					wrapInSection(
						[
							{
								type: "table",
								children: [
									{
										type: "tableRow",
										children: [
											{ type: "tableCell", children: [{ type: "text", value: "Parameter" }] },
											{ type: "tableCell", children: [{ type: "text", value: "Modifiers" }] },
											{ type: "tableCell", children: [{ type: "text", value: "Type" }] },
											{
												type: "tableCell",
												children: [{ type: "text", value: "Description" }],
											},
										],
									},
									{
										type: "tableRow",
										children: [
											{
												type: "tableCell",
												children: [{ type: "text", value: "testParameter" }],
											},
											{ type: "tableCell", children: [] },
											{
												type: "tableCell",
												children: [{ type: "text", value: "TTypeParameter" }],
											},
											{
												type: "tableCell",
												children: [{ type: "text", value: "A test parameter" }],
											},
										],
									},
									{
										type: "tableRow",
										children: [
											{
												type: "tableCell",
												children: [{ type: "text", value: "testOptionalParameter" }],
											},
											{ type: "tableCell", children: [{ type: "text", value: "optional" }] },
											{
												type: "tableCell",
												children: [{ type: "text", value: "TTypeParameter" }],
											},
											{
												type: "tableCell",
												children: [{ type: "text", value: "An optional parameter" }],
											},
										],
									},
								],
							},
						],
						{
							title: "Parameters",
							id: "testfunction-parameters",
						},
					),

					// Returns section
					wrapInSection(
						[
							{
								type: "paragraph",
								children: [{ type: "text", value: "The provided parameter" }],
							},
							{
								type: "paragraph",
								children: [
									{ type: "strong", children: [{ type: "text", value: "Return type" }] },
									{ type: "text", value: ": " },
									{ type: "text", value: "TTypeParameter" },
								],
							},
						],
						{
							title: "Returns",
							id: "testfunction-returns",
						},
					),

					// Throws section
					wrapInSection(
						[
							{
								type: "paragraph",
								children: [{ type: "text", value: "An Error when something bad happens." }],
							},
						],
						{
							title: "Throws",
							id: `testfunction-throws`,
						},
					),
				],
				{ title: "testFunction", id: "testfunction-function" },
			),
		];

		expect(result).deep.equals(expected);
	});

	it("Transform ApiInterface", () => {
		const model = generateModel("test-interface.json");
		const members = getApiItems(model);
		const apiInterface = findApiMember(
			members,
			"TestInterface",
			ApiItemKind.Interface,
		) as ApiInterface;

		const config = createConfig(defaultPartialConfig, model);

		const result = config.transformations[ApiItemKind.Interface](
			apiInterface,
			config,
			(childItem) => apiItemToSections(childItem, config),
		);

		const expected: DocumentationNode[] = [
			// Summary section
			wrapInSection([
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test interface" }],
				},
			]),

			// Signature section
			wrapInSection(
				[
					{
						type: "code",
						lang: "typescript",
						value: "export interface TestInterface",
					},
				],
				{ title: "Signature", id: "testinterface-signature" },
			),

			// Remarks section
			wrapInSection(
				[
					{
						type: "paragraph",
						children: [{ type: "text", value: "Here are some remarks about the interface" }],
					},
				],
				{ title: "Remarks", id: "testinterface-remarks" },
			),

			// Properties section
			wrapInSection(
				[
					{
						type: "table",

						children: [
							{
								type: "tableRow",
								children: [
									{ type: "tableCell", children: [{ type: "text", value: "Property" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Modifiers" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Default Value" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Type" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Description" }] },
								],
							},
							{
								type: "tableRow",
								children: [
									{
										type: "tableCell",
										children: [
											{
												type: "link",
												url: "/test-package/testinterface-interface#testoptionalinterfaceproperty-propertysignature",
												children: [{ type: "text", value: "testOptionalInterfaceProperty" }],
											},
										],
									},
									{
										type: "tableCell",
										children: [{ type: "inlineCode", value: "optional" }],
									},
									{
										type: "tableCell",
										children: [{ type: "text", value: "0" }],
									},
									{
										type: "tableCell",
										children: [{ type: "text", value: "number" }],
									},
									{
										type: "tableCell",
										children: [{ type: "text", value: "Test optional property" }],
									},
								],
							},
						],
					},
				],
				{ title: "Properties" },
			),

			// Property details section
			wrapInSection(
				[
					wrapInSection(
						[
							// Summary section
							wrapInSection([
								{
									type: "paragraph",
									children: [{ type: "text", value: "Test optional property" }],
								},
							]),
							// Signature section
							wrapInSection(
								[
									{
										type: "code",
										lang: "typescript",
										value: "testOptionalInterfaceProperty?: number;",
									},
									{
										type: "paragraph",
										children: [
											{
												type: "strong",
												children: [{ type: "text", value: "Type" }],
											},
											{ type: "text", value: ": " },
											{ type: "text", value: "number" },
										],
									},
								],
								{
									title: "Signature",
									id: "testoptionalinterfaceproperty-signature",
								},
							),
						],
						{
							title: "testOptionalInterfaceProperty",
							id: "testoptionalinterfaceproperty-propertysignature",
						},
					),
				],
				{ title: "Property Details" },
			),
		];

		expect(result).deep.equals(expected);
	});

	it("Transform Namespace with children at different release levels", () => {
		const model = generateModel("test-namespace.json");
		const members = getApiItems(model);
		const apiNamespace = findApiMember(
			members,
			"TestNamespace",
			ApiItemKind.Namespace,
		) as ApiNamespace;

		const config = createConfig(
			{
				...defaultPartialConfig,
				minimumReleaseLevel: ReleaseTag.Beta, // Only include `@beta` and `@public` items in generated docs
			},
			model,
		);

		const result = config.transformations[ApiItemKind.Namespace](
			apiNamespace,
			config,
			(childItem) => apiItemToSections(childItem, config),
		);

		// Note: the namespace being processed includes 3 const variables:
		// - foo (@public)
		// - bar (@beta)
		// - baz (@alpha)
		// We expect docs to be generated for `foo` and `bar`, but not `baz`, since it's @alpha, and we are filtering those out per our config above.
		// Also note that child items are listed alphabetically, so we expect `bar` before `foo`.
		const expected: DocumentationNode[] = [
			// Summary section
			wrapInSection([
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test namespace" }],
				},
			]),

			// Signature section
			wrapInSection(
				[
					{
						type: "code",
						lang: "typescript",
						value: "export declare namespace TestNamespace",
					},
				],
				{ title: "Signature", id: "testnamespace-signature" },
			),

			// Variables section
			wrapInSection(
				[
					{
						type: "table",

						children: [
							// Table header row
							{
								type: "tableRow",
								children: [
									{ type: "tableCell", children: [{ type: "text", value: "Variable" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Alerts" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Modifiers" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Type" }] },
									{ type: "tableCell", children: [{ type: "text", value: "Description" }] },
								],
							},
							// Table row for `bar`
							{
								type: "tableRow",
								children: [
									{
										type: "tableCell",
										children: [
											{
												type: "link",
												url: "/test-package/testnamespace-namespace/#bar-variable",
												children: [{ type: "text", value: "bar" }],
											},
										],
									},
									{
										type: "tableCell",
										children: [{ type: "inlineCode", value: "Beta" }],
									},
									{
										type: "tableCell",
										children: [{ type: "inlineCode", value: "readonly" }],
									},
									{
										type: "tableCell",
										children: [],
									},
									{
										type: "tableCell",
										children: [],
									},
								],
							},
							// Table row for `foo`
							{
								type: "tableRow",
								children: [
									{
										type: "tableCell",
										children: [
											{
												type: "link",
												url: "/test-package/testnamespace-namespace/#foo-variable",
												children: [{ type: "text", value: "foo" }],
											},
										],
									},
									{
										type: "tableCell",
										children: [],
									},
									{
										type: "tableCell",
										children: [{ type: "inlineCode", value: "readonly" }],
									},
									{
										type: "tableCell",
										children: [],
									},
									{
										type: "tableCell",
										children: [],
									},
								],
							},
							// No entry for `baz`
						],
					},
				],
				{ title: "Variables" },
			),

			// Variables details section
			wrapInSection(
				[
					// Details for `bar`
					wrapInSection(
						[
							// No summary docs on `bar`

							// Beta warning
							wrapInSection([
								{
									type: "paragraph",
									children: [betaWarningSpan],
								},
							]),
							// Signature
							wrapInSection(
								[
									{
										type: "code",
										lang: "typescript",
										value: 'bar = "bar"',
									},
								],
								{
									title: "Signature",
									id: "bar-signature",
								},
							),
						],
						{
							title: "bar",
							id: "bar-variable",
						},
					),
					// Details for `foo`
					wrapInSection(
						[
							// No summary docs on `foo`

							// Signature
							wrapInSection(
								[
									{
										type: "code",
										lang: "typescript",
										value: 'foo = "foo"',
									},
								],
								{
									title: "Signature",
									id: "foo-signature",
								},
							),
						],
						{
							title: "foo",
							id: "foo-variable",
						},
					),

					// No entry should be included for `baz` because it is `@alpha`
				],
				{ title: "Variable Details" },
			),
		];

		expect(result).deep.equals(expected);
	});

	it("Transform a Model with multiple entry-points", () => {
		const model = generateModel("multiple-entry-points.json");
		const config = createConfig(defaultPartialConfig, model);

		const documents = transformApiModel(config);
		expect(documents).to.have.length(4); // Model, package, and 2 entry-points

		// The model-level doc in this case isn't particularly interesting, so we will skip evaluating it.

		const expectedPackageDocument: ApiDocument = {
			apiItem: model.packages[0],
			documentPath: "test-package/index",
			contents: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							{
								type: "paragraph",
								children: [
									{
										type: "link",
										url: "/",
										children: [{ type: "text", value: "Packages" }],
									},
									{
										type: "text",
										value: " > ",
									},
									{
										type: "link",
										url: "/test-package/",
										children: [{ type: "text", value: "test-package" }],
									},
								],
							},
						]),

						// Body
						new SectionNode(
							[
								{
									type: "list",
									ordered: false,
									children: [
										{
											type: "listItem",
											children: [
												{
													type: "paragraph",
													children: [
														{
															type: "link",
															url: "/test-package/entry-point-a-entrypoint",
															children: [{ type: "text", value: "entry-point-a" }],
														},
													],
												},
											],
										},
										{
											type: "listItem",
											children: [
												{
													type: "paragraph",
													children: [
														{
															type: "link",
															url: "/test-package/entry-point-b-entrypoint",
															children: [{ type: "text", value: "entry-point-b" }],
														},
													],
												},
											],
										},
									],
								},
							],
							new HeadingNode("Entry Points"),
						),
					],
					new HeadingNode("test-package"),
				),
			],
		};
		expect(documents[1]).to.deep.equal(expectedPackageDocument);

		const expectedEntryPointADocument: ApiDocument = {
			apiItem: model.packages[0].entryPoints[0],
			documentPath: "test-package/entry-point-a-entrypoint",
			contents: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							{
								type: "paragraph",
								children: [
									{
										type: "link",
										url: "/",
										children: [{ type: "text", value: "Packages" }],
									},
									{
										type: "text",
										value: " > ",
									},
									{
										type: "link",
										url: "/test-package/",
										children: [{ type: "text", value: "test-package" }],
									},
									{
										type: "text",
										value: " > ",
									},
									{
										type: "link",
										url: "/test-package/entry-point-a-entrypoint",
										children: [{ type: "text", value: "entry-point-a" }],
									},
								],
							},
						]),

						// Variables table
						new SectionNode(
							[
								{
									type: "table",

									children: [
										{
											type: "tableRow",
											children: [
												{ type: "tableCell", children: [{ type: "text", value: "Variable" }] },
												{
													type: "tableCell",
													children: [{ type: "text", value: "Modifiers" }],
												},
												{ type: "tableCell", children: [{ type: "text", value: "Type" }] },
												{
													type: "tableCell",
													children: [{ type: "text", value: "Description" }],
												},
											],
										},
										{
											type: "tableRow",
											children: [
												{
													type: "tableCell",
													children: [
														{
															type: "link",
															url: "/test-package/#hello-variable",
															children: [{ type: "text", value: "hello" }],
														},
													],
												},
												{
													type: "tableCell",
													children: [
														{
															type: "inlineCode",
															value: "readonly",
														},
													],
												},
												{
													type: "tableCell",
													children: [],
												},
												{
													type: "tableCell",
													children: [
														{
															type: "text",
															value: "Test Constant",
														},
													],
												},
											],
										},
									],
								},
							],
							new HeadingNode("Variables"),
						),

						// Variables details
						new SectionNode(
							[
								new SectionNode(
									[
										// Summary
										new SectionNode([
											{
												type: "paragraph",
												children: [{ type: "text", value: "Test Constant" }],
											},
										]),

										// Signature
										new SectionNode(
											[
												{
													type: "code",
													lang: "typescript",
													value: 'hello = "Hello"',
												},
											],
											new HeadingNode("Signature", "hello-signature"),
										),
									],
									new HeadingNode("hello", "hello-variable"),
								),
							],
							new HeadingNode("Variable Details"),
						),
					],
					new HeadingNode("entry-point-a"),
				),
			],
		};
		expect(documents[2]).to.deep.equal(expectedEntryPointADocument);

		const expectedEntryPointBDocument: ApiDocument = {
			apiItem: model.packages[0].entryPoints[1],
			documentPath: "test-package/entry-point-b-entrypoint",
			contents: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							{
								type: "paragraph",
								children: [
									{
										type: "link",
										url: "/",
										children: [{ type: "text", value: "Packages" }],
									},
									{
										type: "text",
										value: " > ",
									},
									{
										type: "link",
										url: "/test-package/",
										children: [{ type: "text", value: "test-package" }],
									},
									{
										type: "text",
										value: " > ",
									},
									{
										type: "link",
										url: "/test-package/entry-point-b-entrypoint",
										children: [{ type: "text", value: "entry-point-b" }],
									},
								],
							},
						]),

						// Variables table
						new SectionNode(
							[
								{
									type: "table",

									children: [
										{
											type: "tableRow",
											children: [
												{ type: "tableCell", children: [{ type: "text", value: "Variable" }] },
												{ type: "tableCell", children: [{ type: "text", value: "Type" }] },
												{
													type: "tableCell",
													children: [{ type: "text", value: "Description" }],
												},
											],
										},
										{
											type: "tableRow",
											children: [
												{
													type: "tableCell",
													children: [
														{
															type: "link",
															url: "/test-package/#world-variable",
															children: [{ type: "text", value: "world" }],
														},
													],
												},
												{
													type: "tableCell",
													children: [],
												},
												{
													type: "tableCell",
													children: [
														{
															type: "text",
															value: "Test Constant",
														},
													],
												},
											],
										},
									],
								},
							],
							new HeadingNode("Variables"),
						),

						// Variables details
						new SectionNode(
							[
								new SectionNode(
									[
										// Summary
										new SectionNode([
											{
												type: "paragraph",
												children: [{ type: "text", value: "Test Constant" }],
											},
										]),

										// Signature
										new SectionNode(
											[
												{
													type: "code",
													lang: "typescript",
													value: 'world = "world"',
												},
											],
											new HeadingNode("Signature", "world-signature"),
										),
									],
									new HeadingNode("world", "world-variable"),
								),
							],
							new HeadingNode("Variable Details"),
						),
					],
					new HeadingNode("entry-point-b"),
				),
			],
		};
		expect(documents[3]).to.deep.equal(expectedEntryPointBDocument);
	});
});
