/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiFunction,
	type ApiItem,
	ApiItemKind,
	type ApiModel,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import {
	type ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "../../index.js";
import {
	createQualifiedDocumentNameForApiItem,
	getLinkTargetForApiItem,
	isItemOrAncestorExcluded,
} from "../index.js";

function createMockApiItem(kind: ApiItemKind, displayName: string, parent?: ApiItem): ApiItem {
	return { kind, displayName, parent } as unknown as ApiItem;
}

function createMockApiFunction(
	displayName: string,
	overloadIndex: number,
	parent: ApiItem,
): ApiFunction {
	const emptyTokenRange = { startIndex: 0, endIndex: 0 };
	const apiFunction = new ApiFunction({
		docComment: undefined,
		excerptTokens: [],
		isExported: true,
		name: displayName,
		overloadIndex,
		parameters: [],
		releaseTag: ReleaseTag.Public,
		returnTypeTokenRange: emptyTokenRange,
		typeParameters: [],
	});
	Object.defineProperty(apiFunction, "parent", { value: parent });
	return apiFunction;
}

describe("ApiItemTransformUtilities", () => {
	describe("getLinkTargetForApiItem", () => {
		const apiModel = createMockApiItem(ApiItemKind.Model, "Model") as ApiModel;
		const apiPackage = createMockApiItem(ApiItemKind.Package, "@scope/test-package", apiModel);

		function createConfig(): ApiItemTransformationConfiguration {
			return getApiItemTransformationConfigurationWithDefaults({ apiModel });
		}

		it("returns the document path for an item rendered as its own document", () => {
			const apiInterface = createMockApiItem(
				ApiItemKind.Interface,
				"TestInterface",
				apiPackage,
			);

			expect(getLinkTargetForApiItem(apiInterface, createConfig())).to.deep.equal({
				documentPath: "test-package/testinterface-interface",
				headingId: undefined,
			});
		});

		it("returns the ancestor document and heading for an item rendered as a section", () => {
			const apiInterface = createMockApiItem(
				ApiItemKind.Interface,
				"TestInterface",
				apiPackage,
			);
			const method = createMockApiItem(
				ApiItemKind.MethodSignature,
				"testInterfaceMethod",
				apiInterface,
			);

			expect(getLinkTargetForApiItem(method, createConfig())).to.deep.equal({
				documentPath: "test-package/testinterface-interface",
				headingId: "testinterfacemethod-methodsignature",
			});
		});

		it("accounts for namespace folder hierarchy", () => {
			const apiNamespace = createMockApiItem(
				ApiItemKind.Namespace,
				"TestNamespace",
				apiPackage,
			);
			const apiFunction = createMockApiItem(
				ApiItemKind.Function,
				"testFunction",
				apiNamespace,
			);

			expect(getLinkTargetForApiItem(apiFunction, createConfig())).to.deep.equal({
				documentPath: "test-package/testnamespace-namespace/index",
				headingId: "testfunction-function",
			});
		});

		it("uses configured document names", () => {
			const apiInterface = createMockApiItem(
				ApiItemKind.Interface,
				"TestInterface",
				apiPackage,
			);
			const config = getApiItemTransformationConfigurationWithDefaults({
				apiModel,
				hierarchy: {
					getDocumentName: (apiItem, hierarchyConfig) => {
						switch (apiItem.kind) {
							case ApiItemKind.Model:
							case ApiItemKind.Package:
							case ApiItemKind.Namespace: {
								return "index";
							}
							case ApiItemKind.Interface: {
								return "custom-interface";
							}
							default: {
								return createQualifiedDocumentNameForApiItem(apiItem, hierarchyConfig);
							}
						}
					},
				},
			});

			expect(getLinkTargetForApiItem(apiInterface, config)).to.deep.equal({
				documentPath: "test-package/custom-interface",
				headingId: undefined,
			});
		});

		it("returns distinct headings for overloads", () => {
			const config = createConfig();
			const targets = [1, 2, 3].map((overloadIndex) =>
				getLinkTargetForApiItem(
					createMockApiFunction("functionWithOverloads", overloadIndex, apiPackage),
					config,
				),
			);

			expect(targets).to.deep.equal([
				{
					documentPath: "test-package/index",
					headingId: "functionwithoverloads-function",
				},
				{
					documentPath: "test-package/index",
					headingId: "functionwithoverloads_1-function",
				},
				{
					documentPath: "test-package/index",
					headingId: "functionwithoverloads_2-function",
				},
			]);
		});
	});

	describe("isItemOrAncestorExcluded", () => {
		it("Item is excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const item = {
				displayName: "foo",
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.true;
		});

		it("Parent item is excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const parent = {
				displayName: "foo",
			} as unknown as ApiItem;

			const item = {
				displayName: "bar",
				parent,
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.true;
		});

		it("Neither item nor ancestors are excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const parent = {
				displayName: "bar",
			} as unknown as ApiItem;

			const item = {
				displayName: "baz",
				parent,
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.false;
		});
	});
});
