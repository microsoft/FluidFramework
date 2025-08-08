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

import type { MarkdownDocument } from "../../ApiDocument.js";
import type { NormalizedTree } from "../../mdast/index.js";
import { apiItemToDocument } from "../TransformApiItem.js";
import { transformApiModel } from "../TransformApiModel.js";
import {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	getApiItemTransformationConfigurationWithDefaults,
	HierarchyKind,
} from "../configuration/index.js";
import { betaWarningSpan } from "../helpers/index.js";

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

		const config = createConfig(
			{
				hierarchy: {
					// Allow test to transform variables to their own documents.
					// By default, they are included in the document of their parent context.
					[ApiItemKind.Variable]: HierarchyKind.Document,
				},
			},
			model,
		);

		const result: NormalizedTree = apiItemToDocument(apiVariable, config).contents;

		const expected: NormalizedTree = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [{ type: "text", value: "TestConst" }],
				},
				// Breadcrumb
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
							url: "/test-package/testconst-variable",
							children: [{ type: "text", value: "TestConst" }],
						},
					],
				},
				// Summary section
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test Constant" }],
				},
				// #region Signature section
				{
					type: "html",
					value: '<h2 id="testconst-signature">Signature</h2>',
				},
				{
					type: "code",
					lang: "typescript",
					value: 'TestConst = "Hello world!"',
				},
				// #endregion
			],
		};

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

		const config = createConfig(
			{
				hierarchy: {
					// Allow test to transform variables to their own documents.
					// By default, they are included in the document of their parent context.
					[ApiItemKind.Function]: HierarchyKind.Document,
				},
			},
			model,
		);

		const result: NormalizedTree = apiItemToDocument(apiFunction, config).contents;

		const expected: NormalizedTree = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [{ type: "text", value: "testFunction" }],
				},
				// Breadcrumb
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
							url: "/test-package/testfunction-function",
							children: [
								{ type: "text", value: "testFunction(testParameter, testOptionalParameter)" },
							],
						},
					],
				},
				// Summary section
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test function" }],
				},
				// #region Signature section
				{
					type: "html",
					value: '<h2 id="testfunction-signature">Signature</h2>',
				},
				{
					type: "code",
					lang: "typescript",
					value:
						"export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;",
				},
				// #endregion
				// #region Type parameters table section
				{
					type: "heading",
					depth: 3,
					children: [{ type: "text", value: "Type Parameters" }],
				},
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
				// #endregion
				// #region Parameters table section
				{
					type: "html",
					value: '<h2 id="testfunction-parameters">Parameters</h2>',
				},
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
				// #endregion
				// #region Returns section
				{
					type: "html",
					value: '<h2 id="testfunction-returns">Returns</h2>',
				},
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
				// #endregion
				// #region Throws section
				{
					type: "html",
					value: '<h2 id="testfunction-throws">Throws</h2>',
				},
				{
					type: "paragraph",
					children: [{ type: "text", value: "An Error when something bad happens." }],
				},
				// #endregion
			],
		};

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

		const config = createConfig({}, model);

		const result: NormalizedTree = apiItemToDocument(apiInterface, config).contents;

		const expected: NormalizedTree = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [{ type: "text", value: "TestInterface" }],
				},
				// Breadcrumb
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
							url: "/test-package/testinterface-interface",
							children: [{ type: "text", value: "TestInterface" }],
						},
					],
				},
				// Summary section
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test interface" }],
				},
				// #region Signature section
				{
					type: "html",
					value: '<h2 id="testinterface-signature">Signature</h2>',
				},
				{
					type: "code",
					lang: "typescript",
					value: "export interface TestInterface",
				},
				// #endregion
				// #region Remarks section
				{
					type: "html",
					value: '<h2 id="testinterface-remarks">Remarks</h2>',
				},
				{
					type: "paragraph",
					children: [{ type: "text", value: "Here are some remarks about the interface" }],
				},
				// #endregion
				// #region Properties section
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Properties" }],
				},
				{
					type: "table",
					children: [
						{
							type: "tableRow",
							children: [
								{ type: "tableCell", children: [{ type: "text", value: "Property" }] },
								{ type: "tableCell", children: [{ type: "text", value: "Modifiers" }] },
								{
									type: "tableCell",
									children: [{ type: "text", value: "Default Value" }],
								},
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

				// #endregion
				// #region Property details section
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Property Details" }],
				},
				{
					type: "html",
					value: `<h3 id="testoptionalinterfaceproperty-propertysignature">testOptionalInterfaceProperty</h3>`,
				},
				// Summary section
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test optional property" }],
				},
				// Signature section
				{
					type: "html",
					value: `<h4 id="testoptionalinterfaceproperty-signature">Signature</h4>`,
				},
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

				// #endregion
			],
		};

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
				// Only include `@beta` and `@public` items in generated docs
				minimumReleaseLevel: ReleaseTag.Beta,
			},
			model,
		);

		const result: NormalizedTree = apiItemToDocument(apiNamespace, config).contents;

		// Note: the namespace being processed includes 3 const variables:
		// - foo (@public)
		// - bar (@beta)
		// - baz (@alpha)
		// We expect docs to be generated for `foo` and `bar`, but not `baz`, since it's @alpha, and we are filtering those out per our config above.
		// Also note that child items are listed alphabetically, so we expect `bar` before `foo`.
		const expected: NormalizedTree = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [{ type: "text", value: "TestNamespace" }],
				},
				// Breadcrumb
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
							url: "/test-package/testnamespace-namespace/",
							children: [{ type: "text", value: "TestNamespace" }],
						},
					],
				},
				// #region Summary section
				{
					type: "paragraph",
					children: [{ type: "text", value: "Test namespace" }],
				},
				// #endregion
				// #region Signature section
				{
					type: "html",
					value: '<h2 id="testnamespace-signature">Signature</h2>',
				},
				{
					type: "code",
					lang: "typescript",
					value: "export declare namespace TestNamespace",
				},
				// #endregion
				// #region Variables section
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Variables" }],
				},
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
				// #endregion
				// #region Variables details section
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Variable Details" }],
				},
				// #region Details for `bar`
				{
					type: "html",
					value: `<h3 id="bar-variable">bar</h3>`,
				},
				// No summary docs on `bar`
				// Beta warning
				{
					type: "paragraph",
					children: [betaWarningSpan],
				},
				// Signature
				{
					type: "html",
					value: `<h4 id="bar-signature">Signature</h4>`,
				},
				{
					type: "code",
					lang: "typescript",
					value: 'bar = "bar"',
				},
				// #endregion
				// #region Details for `foo`
				{
					type: "html",
					value: `<h3 id="foo-variable">foo</h3>`,
				},
				// No summary docs on `foo`
				// Signature
				{
					type: "html",
					value: `<h4 id="foo-signature">Signature</h4>`,
				},
				{
					type: "code",
					lang: "typescript",
					value: 'foo = "foo"',
				},
				// #endregion
				// No entry should be included for `baz` because it is `@alpha`
				// #endregion
			],
		};

		expect(result).deep.equals(
			expected,
			// `EXPECTED: ${JSON.stringify(expected, undefined, 2)}\n\nACTUAL: ${JSON.stringify(result, undefined, 2)}`,
		);
	});

	it("Transform a Model with multiple entry-points", () => {
		const model = generateModel("multiple-entry-points.json");
		const config = createConfig({}, model);

		const documents = transformApiModel(config);
		expect(documents).to.have.length(4); // Model, package, and 2 entry-points

		// The model-level doc in this case isn't particularly interesting, so we will skip evaluating it.

		const expectedPackageDocument: MarkdownDocument = {
			apiItem: model.packages[0],
			documentPath: "test-package/index",
			contents: {
				type: "root",
				children: [
					{
						type: "heading",
						depth: 1,
						children: [{ type: "text", value: "test-package" }],
					},
					// Breadcrumb
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
					// Body
					{
						type: "heading",
						depth: 2,
						children: [{ type: "text", value: "Entry Points" }],
					},
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
			},
		};
		expect(documents[1]).to.deep.equal(expectedPackageDocument);

		const expectedEntryPointADocument: MarkdownDocument = {
			apiItem: model.packages[0].entryPoints[0],
			documentPath: "test-package/entry-point-a-entrypoint",
			contents: {
				type: "root",
				children: [
					{ type: "heading", depth: 1, children: [{ type: "text", value: "entry-point-a" }] },
					// Breadcrumb
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

					// Variables table
					{ type: "heading", depth: 2, children: [{ type: "text", value: "Variables" }] },
					{
						type: "table",

						children: [
							{
								type: "tableRow",
								children: [
									{
										type: "tableCell",
										children: [{ type: "text", value: "Variable" }],
									},
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

					// Variables details
					{
						type: "heading",
						depth: 2,
						children: [{ type: "text", value: "Variable Details" }],
					},
					{ type: "html", value: `<h3 id="hello-variable">hello</h3>` },
					// Summary
					{
						type: "paragraph",
						children: [{ type: "text", value: "Test Constant" }],
					},

					// Signature
					{ type: "html", value: `<h4 id="hello-signature">Signature</h4>` },
					{
						type: "code",
						lang: "typescript",
						value: 'hello = "Hello"',
					},
				],
			},
		};
		expect(documents[2]).to.deep.equal(expectedEntryPointADocument);

		const expectedEntryPointBDocument: MarkdownDocument = {
			apiItem: model.packages[0].entryPoints[1],
			documentPath: "test-package/entry-point-b-entrypoint",
			contents: {
				type: "root",
				children: [
					{ type: "heading", depth: 1, children: [{ type: "text", value: "entry-point-b" }] },
					// Breadcrumb
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

					// #region Variables table
					{ type: "heading", depth: 2, children: [{ type: "text", value: "Variables" }] },
					{
						type: "table",
						children: [
							{
								type: "tableRow",
								children: [
									{
										type: "tableCell",
										children: [{ type: "text", value: "Variable" }],
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
					// #endregion
					// #region Variables details
					{
						type: "heading",
						depth: 2,
						children: [{ type: "text", value: "Variable Details" }],
					},
					// #region Details for `world`
					{
						type: "html",
						value: `<h3 id="world-variable">world</h3>`,
					},
					// Summary
					{
						type: "paragraph",
						children: [{ type: "text", value: "Test Constant" }],
					},
					// #region Signature
					{
						type: "html",
						value: `<h4 id="world-signature">Signature</h4>`,
					},
					{
						type: "code",
						lang: "typescript",
						value: 'world = "world"',
					},
					// #endregion
					// #endregion
					// #endregion
				],
			},
		};
		expect(documents[3]).to.deep.equal(
			expectedEntryPointBDocument,
			// `EXPECTED: ${JSON.stringify(expectedEntryPointBDocument.contents, undefined, 2)}\n\nACTUAL: ${JSON.stringify(documents[3].contents, undefined, 2)}`,
		);
	});
});
