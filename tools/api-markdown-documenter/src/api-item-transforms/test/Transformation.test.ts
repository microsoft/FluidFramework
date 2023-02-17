/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import {
	ApiFunction,
	ApiInterface,
	ApiItem,
	ApiItemKind,
	ApiModel,
	ApiVariable,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import {
	MarkdownDocumenterConfiguration,
	markdownDocumenterConfigurationWithDefaults,
} from "../../Configuration";
import {
	CodeSpanNode,
	DocumentationNode,
	FencedCodeBlockNode,
	LinkNode,
	ParagraphNode,
	PlainTextNode,
	SpanNode,
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
} from "../../documentation-domain";
import { getHeadingForApiItem } from "../../utilities";
import { apiItemToSections } from "../TransformApiItem";
import { wrapInSection } from "../helpers";

/**
 * Sample "default" configuration.
 */
const defaultPartialConfig: Omit<MarkdownDocumenterConfiguration, "apiModel"> = {
	uriRoot: ".",
};

function generateModel(testReportFileName: string): ApiModel {
	const filePath = Path.resolve(__dirname, "test-data", testReportFileName);

	const apiModel = new ApiModel();
	apiModel.loadPackage(filePath);

	return apiModel;
}

function getApiItems(apiModel: ApiModel): readonly ApiItem[] {
	const packages = apiModel.packages;
	expect(packages.length).to.equal(1);

	const entryPoints = packages[0].entryPoints;
	expect(entryPoints.length).to.equal(1);

	return entryPoints[0].members;
}

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

function createConfig(
	partialConfig: Omit<MarkdownDocumenterConfiguration, "apiModel">,
	apiModel: ApiModel,
): Required<MarkdownDocumenterConfiguration> {
	return markdownDocumenterConfigurationWithDefaults({
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
							wrapInSection([
								ParagraphNode.createFromPlainText("Test optional property"),
							]),
							wrapInSection(
								[
									FencedCodeBlockNode.createFromPlainText(
										"testOptionalInterfaceProperty?: number;",
										"typescript",
									),
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
});
