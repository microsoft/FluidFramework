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

import {
	CodeSpanNode,
	DocumentNode,
	type DocumentationNode,
	FencedCodeBlockNode,
	HeadingNode,
	LinkNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
	UnorderedListNode,
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
	uriRoot: ".",
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

		const result = config.transformApiVariable(apiVariable, config);

		const expected = [
			wrapInSection(
				[
					wrapInSection([ParagraphNode.createFromPlainText("Test Constant")]),
					wrapInSection(
						[
							FencedCodeBlockNode.createFromPlainText(
								'TestConst = "Hello world!"',
								"typescript",
							),
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

		const result = config.transformApiFunction(apiFunction, config);

		const expected = [
			wrapInSection(
				[
					// Summary section
					wrapInSection([ParagraphNode.createFromPlainText("Test function")]),

					// Signature section
					wrapInSection(
						[
							new FencedCodeBlockNode(
								[
									new PlainTextNode(
										"export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;",
									),
								],
								"typescript",
							),
							new ParagraphNode([
								new SectionNode(
									[
										new TableNode(
											[
												new TableBodyRowNode([
													TableBodyCellNode.createFromPlainText(
														"TTypeParameter",
													),
													TableBodyCellNode.createFromPlainText(
														"A test type parameter",
													),
												]),
											],
											new TableHeaderRowNode([
												TableHeaderCellNode.createFromPlainText(
													"Parameter",
												),
												TableHeaderCellNode.createFromPlainText(
													"Description",
												),
											]),
										),
									],
									HeadingNode.createFromPlainText("Type Parameters"),
								),
							]),
						],
						{
							title: "Signature",
							id: `testfunction-signature`,
						},
					),

					// Parameters table section
					wrapInSection(
						[
							new TableNode(
								[
									new TableBodyRowNode([
										TableBodyCellNode.createFromPlainText("testParameter"),
										TableBodyCellNode.Empty,
										new TableBodyCellNode([
											SpanNode.createFromPlainText("TTypeParameter"),
										]),
										TableBodyCellNode.createFromPlainText("A test parameter"),
									]),
									new TableBodyRowNode([
										TableBodyCellNode.createFromPlainText(
											"testOptionalParameter",
										),
										TableBodyCellNode.createFromPlainText("optional"),
										new TableBodyCellNode([
											SpanNode.createFromPlainText("TTypeParameter"),
										]),
										TableBodyCellNode.createFromPlainText(
											"An optional parameter",
										),
									]),
								],
								new TableHeaderRowNode([
									TableHeaderCellNode.createFromPlainText("Parameter"),
									TableHeaderCellNode.createFromPlainText("Modifiers"),
									TableHeaderCellNode.createFromPlainText("Type"),
									TableHeaderCellNode.createFromPlainText("Description"),
								]),
							),
						],
						{
							title: "Parameters",
							id: "testfunction-parameters",
						},
					),

					// Returns section
					wrapInSection(
						[
							ParagraphNode.createFromPlainText("The provided parameter"),
							new ParagraphNode([
								SpanNode.createFromPlainText("Return type: ", { bold: true }),
								SpanNode.createFromPlainText("TTypeParameter"),
							]),
						],
						{
							title: "Returns",
							id: "testfunction-returns",
						},
					),

					// Throws section
					wrapInSection(
						[ParagraphNode.createFromPlainText("An Error when something bad happens.")],
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

		const result = config.transformApiInterface(apiInterface, config, (childItem) =>
			apiItemToSections(childItem, config),
		);

		const expected: DocumentationNode[] = [
			// Summary section
			wrapInSection([ParagraphNode.createFromPlainText("Test interface")]),

			// Signature section
			wrapInSection(
				[
					FencedCodeBlockNode.createFromPlainText(
						"export interface TestInterface",
						"typescript",
					),
				],
				{ title: "Signature", id: "testinterface-signature" },
			),

			// Remarks section
			wrapInSection(
				[ParagraphNode.createFromPlainText("Here are some remarks about the interface")],
				{ title: "Remarks", id: "testinterface-remarks" },
			),

			// Properties section
			wrapInSection(
				[
					new TableNode(
						[
							new TableBodyRowNode([
								new TableBodyCellNode([
									LinkNode.createFromPlainText(
										"testOptionalInterfaceProperty",
										"./test-package/testinterface-interface#testoptionalinterfaceproperty-propertysignature",
									),
								]),
								new TableBodyCellNode([
									CodeSpanNode.createFromPlainText("optional"),
								]),
								TableBodyCellNode.createFromPlainText("0"),
								new TableBodyCellNode([SpanNode.createFromPlainText("number")]),
								TableBodyCellNode.createFromPlainText("Test optional property"),
							]),
						],
						new TableHeaderRowNode([
							TableHeaderCellNode.createFromPlainText("Property"),
							TableHeaderCellNode.createFromPlainText("Modifiers"),
							TableHeaderCellNode.createFromPlainText("Default Value"),
							TableHeaderCellNode.createFromPlainText("Type"),
							TableHeaderCellNode.createFromPlainText("Description"),
						]),
					),
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
								ParagraphNode.createFromPlainText("Test optional property"),
							]),
							// Signature section
							wrapInSection(
								[
									FencedCodeBlockNode.createFromPlainText(
										"testOptionalInterfaceProperty?: number;",
										"typescript",
									),
									new ParagraphNode([
										new SpanNode([
											SpanNode.createFromPlainText("Type: ", { bold: true }),
											SpanNode.createFromPlainText("number"),
										]),
									]),
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

		const result = config.transformApiNamespace(apiNamespace, config, (childItem) =>
			apiItemToSections(childItem, config),
		);

		// Note: the namespace being processed includes 3 const variables:
		// - foo (@public)
		// - bar (@beta)
		// - baz (@alpha)
		// We expect docs to be generated for `foo` and `bar`, but not `baz`, since it's @alpha, and we are filtering those out per our config above.
		// Also note that child items are listed alphabetically, so we expect `bar` before `foo`.
		const expected: DocumentationNode[] = [
			// Summary section
			wrapInSection([ParagraphNode.createFromPlainText("Test namespace")]),

			// Signature section
			wrapInSection(
				[
					FencedCodeBlockNode.createFromPlainText(
						"export declare namespace TestNamespace",
						"typescript",
					),
				],
				{ title: "Signature", id: "testnamespace-signature" },
			),

			// Variables section
			wrapInSection(
				[
					new TableNode(
						[
							// Table row for `bar`
							new TableBodyRowNode([
								new TableBodyCellNode([
									LinkNode.createFromPlainText(
										"bar",
										"./test-package/testnamespace-namespace#bar-variable",
									),
								]),
								new TableBodyCellNode([CodeSpanNode.createFromPlainText("Beta")]), // Alert
								new TableBodyCellNode([
									CodeSpanNode.createFromPlainText("readonly"),
								]), // Modifier
								TableBodyCellNode.Empty, // Type
								TableBodyCellNode.Empty, // Description
							]),
							// Table row for `foo`
							new TableBodyRowNode([
								new TableBodyCellNode([
									LinkNode.createFromPlainText(
										"foo",
										"./test-package/testnamespace-namespace#foo-variable",
									),
								]),
								TableBodyCellNode.Empty, // No alert for `@public`
								new TableBodyCellNode([
									CodeSpanNode.createFromPlainText("readonly"),
								]), // Modifier
								TableBodyCellNode.Empty, // Type
								TableBodyCellNode.Empty, // Description
							]),
							// No entry should be included for `baz` because it is `@alpha`
						],
						new TableHeaderRowNode([
							TableHeaderCellNode.createFromPlainText("Variable"),
							TableHeaderCellNode.createFromPlainText("Alerts"),
							TableHeaderCellNode.createFromPlainText("Modifiers"),
							TableHeaderCellNode.createFromPlainText("Type"),
							TableHeaderCellNode.createFromPlainText("Description"),
						]),
					),
				],
				{ title: "Variables" },
			),

			// Variables details section
			wrapInSection(
				[
					// Details for `bar`
					wrapInSection(
						[
							// Summary
							wrapInSection([ParagraphNode.Empty]), // No summary docs on `bar`
							// Beta warning
							wrapInSection([betaWarningSpan]),
							// Signature
							wrapInSection(
								[
									FencedCodeBlockNode.createFromPlainText(
										'bar = "bar"',
										"typescript",
									),
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
							// Summary
							wrapInSection([ParagraphNode.Empty]), // No summary docs on `bar`
							// Signature
							wrapInSection(
								[
									FencedCodeBlockNode.createFromPlainText(
										'foo = "foo"',
										"typescript",
									),
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

		const expectedPackageDocument = new DocumentNode({
			apiItem: model.packages[0],
			documentPath: "test-package",
			children: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							new ParagraphNode([
								LinkNode.createFromPlainText("Packages", "./"),
								new PlainTextNode(" > "),
								LinkNode.createFromPlainText("test-package", "./test-package"),
							]),
						]),

						// Body
						new SectionNode(
							[
								new UnorderedListNode([
									LinkNode.createFromPlainText(
										"entry-point-a",
										"./test-package/entry-point-a-entrypoint",
									),
									LinkNode.createFromPlainText(
										"entry-point-b",
										"./test-package/entry-point-b-entrypoint",
									),
								]),
							],
							HeadingNode.createFromPlainText("Entry Points"),
						),
					],
					HeadingNode.createFromPlainText("test-package"),
				),
			],
		});
		expect(documents[1]).to.deep.equal(expectedPackageDocument);

		const expectedEntryPointADocument = new DocumentNode({
			apiItem: model.packages[0].entryPoints[0],
			documentPath: "test-package/entry-point-a-entrypoint",
			children: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							new ParagraphNode([
								LinkNode.createFromPlainText("Packages", "./"),
								new PlainTextNode(" > "),
								LinkNode.createFromPlainText("test-package", "./test-package"),
								new PlainTextNode(" > "),
								LinkNode.createFromPlainText(
									"entry-point-a",
									"./test-package/entry-point-a-entrypoint",
								),
							]),
						]),

						// Variables table
						new SectionNode(
							[
								new TableNode(
									[
										new TableBodyRowNode([
											new TableBodyCellNode([
												LinkNode.createFromPlainText(
													"hello",
													"./test-package#hello-variable",
												),
											]),
											new TableBodyCellNode([
												CodeSpanNode.createFromPlainText("readonly"),
											]),
											TableBodyCellNode.Empty, // Type
											TableBodyCellNode.createFromPlainText("Test Constant"),
										]),
									],
									new TableHeaderRowNode([
										TableHeaderCellNode.createFromPlainText("Variable"),
										TableHeaderCellNode.createFromPlainText("Modifiers"),
										TableHeaderCellNode.createFromPlainText("Type"),
										TableHeaderCellNode.createFromPlainText("Description"),
									]),
								),
							],
							HeadingNode.createFromPlainText("Variables"),
						),

						// Variables details
						new SectionNode(
							[
								new SectionNode(
									[
										// Summary
										new SectionNode([
											ParagraphNode.createFromPlainText("Test Constant"),
										]),

										// Signature
										new SectionNode(
											[
												FencedCodeBlockNode.createFromPlainText(
													'hello = "Hello"',
													"typescript",
												),
											],
											HeadingNode.createFromPlainText(
												"Signature",
												"hello-signature",
											),
										),
									],
									HeadingNode.createFromPlainText("hello", "hello-variable"),
								),
							],
							HeadingNode.createFromPlainText("Variable Details"),
						),
					],
					HeadingNode.createFromPlainText("entry-point-a"),
				),
			],
		});
		expect(documents[2]).to.deep.equal(expectedEntryPointADocument);

		const expectedEntryPointBDocument = new DocumentNode({
			apiItem: model.packages[0].entryPoints[1],
			documentPath: "test-package/entry-point-b-entrypoint",
			children: [
				new SectionNode(
					[
						// Breadcrumb
						new SectionNode([
							new ParagraphNode([
								LinkNode.createFromPlainText("Packages", "./"),
								new PlainTextNode(" > "),
								LinkNode.createFromPlainText("test-package", "./test-package"),
								new PlainTextNode(" > "),
								LinkNode.createFromPlainText(
									"entry-point-b",
									"./test-package/entry-point-b-entrypoint",
								),
							]),
						]),

						// Variables table
						new SectionNode(
							[
								new TableNode(
									[
										new TableBodyRowNode([
											new TableBodyCellNode([
												LinkNode.createFromPlainText(
													"world",
													"./test-package#world-variable",
												),
											]),
											TableBodyCellNode.Empty, // Type
											TableBodyCellNode.createFromPlainText("Test Constant"),
										]),
									],
									new TableHeaderRowNode([
										TableHeaderCellNode.createFromPlainText("Variable"),
										TableHeaderCellNode.createFromPlainText("Type"),
										TableHeaderCellNode.createFromPlainText("Description"),
									]),
								),
							],
							HeadingNode.createFromPlainText("Variables"),
						),

						// Variables details
						new SectionNode(
							[
								new SectionNode(
									[
										// Summary
										new SectionNode([
											ParagraphNode.createFromPlainText("Test Constant"),
										]),

										// Signature
										new SectionNode(
											[
												FencedCodeBlockNode.createFromPlainText(
													'world = "world"',
													"typescript",
												),
											],
											HeadingNode.createFromPlainText(
												"Signature",
												"world-signature",
											),
										),
									],
									HeadingNode.createFromPlainText("world", "world-variable"),
								),
							],
							HeadingNode.createFromPlainText("Variable Details"),
						),
					],
					HeadingNode.createFromPlainText("entry-point-b"),
				),
			],
		});
		expect(documents[3]).to.deep.equal(expectedEntryPointBDocument);
	});
});
