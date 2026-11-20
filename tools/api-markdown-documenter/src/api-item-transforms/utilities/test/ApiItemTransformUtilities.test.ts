/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiFunction,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	ApiModel,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import {
	createInterface,
	createPackage,
	createProperty,
	createReferenceToken,
} from "../../../test/index.js";
import {
	type ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "../../index.js";
import {
	createQualifiedDocumentNameForApiItem,
	getFilteredMembers,
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
	describe("getFilteredMembers", () => {

		/**
		 * Creates a derived interface with inherited, local, and excluded properties for the member-selection tests.
		 *
		 * @remarks
		 * `Base` declares `item2`; `Derived` declares `item3` and `item10`. Sorting by origin would put
		 * `item2` last, while sorting by text alone would put `item10` first. The names distinguish both
		 * mistakes from the expected numeric order.
		 */
		function createFixture(): {
			derived: ApiInterface;
			item2: ApiItem;
			item3: ApiItem;
			item10: ApiItem;
			excluded: ApiItem;
			config: ApiItemTransformationConfiguration;
		} {
			const item2 = createProperty("item2");
			const item3 = createProperty("item3");
			const item10 = createProperty("item10");
			const excluded = createProperty("excluded");
			const base = createInterface("Base", { members: [item2] });
			const derived = createInterface("Derived", {
				bases: [createReferenceToken("Base", "test-api!Base:interface")],
				members: [item10, excluded, item3],
			});
			const apiModel = new ApiModel();
			apiModel.addMember(createPackage("test-api", base, derived));
			const config = getApiItemTransformationConfigurationWithDefaults({
				apiModel,
				exclude: (item) => item === excluded,
			});
			return { derived, item2, item3, item10, excluded, config };
		}

		it("returns only visible direct members in model order by default", () => {
			const { derived, excluded, config } = createFixture();

			// Use the order reported by the API model, not the order in which the fixture supplied the declarations.
			const direct = derived.members.filter((member) => member !== excluded);
			const result = getFilteredMembers(derived, config);
			expect(result.members).to.deep.equal(direct);
			expect(result.declaredMembers).to.deep.equal(direct);
			expect(result.inheritedTypes).to.be.undefined;
		});

		it("sorts inherited and local names numerically without reordering direct declarations", () => {
			const { derived, item2, item3, item10, excluded, config } = createFixture();
			const result = getFilteredMembers(derived, { ...config, includeInheritedMembers: true });

			// Summary rows combine both origins, but detail sections belong to Derived and retain its declaration order.
			expect(result.members).to.deep.equal([item2, item3, item10]);
			expect(result.declaredMembers).to.deep.equal(
				derived.members.filter((member) => member !== excluded),
			);

			// Only inherited rows need a type lookup; a local row gets its type directly from its declaration.
			expect(result.inheritedTypes?.get(item2)?.excerpt.text).to.equal("number");
			expect(result.inheritedTypes?.has(item3)).to.equal(false);
		});

		it("returns no members when the queried type is excluded", () => {
			const { derived, config } = createFixture();

			// Base is still visible. Excluding Derived itself must suppress even the members it could inherit from Base.
			const result = getFilteredMembers(derived, {
				...config,
				includeInheritedMembers: true,
				exclude: (item) => item === derived,
			});
			expect(result.members).to.be.empty;
			expect(result.declaredMembers).to.be.empty;
			expect(result.inheritedTypes).to.be.undefined;
		});
	});

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
