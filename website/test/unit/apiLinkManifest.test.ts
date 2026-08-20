/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiItem,
	ApiItemKind,
	ApiItemUtilities,
	type ApiModel,
	getApiItemTransformationConfigurationWithDefaults,
	HierarchyKind,
} from "@fluid-tools/api-markdown-documenter";
import { describe, expect, it } from "vitest";

// Tests intentionally exercise the website's API documentation infrastructure.
// eslint-disable-next-line import/no-internal-modules
import { createApiLinkManifest } from "../../infra/api-markdown-documenter/api-link-manifest.mjs";

interface MockApiItem {
	readonly kind: ApiItemKind;
	readonly displayName: string;
	readonly parent?: MockApiItem;
	readonly canonicalReference?: string;
	readonly overloadIndex?: number;
	readonly members: MockApiItem[];
}

interface MockApiPackage extends MockApiItem {
	readonly entryPoints: MockApiItem[];
}

interface MockApiModel extends MockApiItem {
	readonly packages: MockApiPackage[];
}

function createMockModel(packageNames = ["@scope/test-package"]): MockApiModel {
	const apiModel: MockApiModel = {
		kind: ApiItemKind.Model,
		displayName: "Model",
		members: [],
		packages: [],
	};

	for (const packageName of packageNames) {
		const apiPackage: MockApiPackage = {
			kind: ApiItemKind.Package,
			displayName: packageName,
			parent: apiModel,
			members: [],
			entryPoints: [],
		};
		const entryPoint: MockApiItem = {
			kind: ApiItemKind.EntryPoint,
			displayName: "",
			parent: apiPackage,
			members: [],
		};
		apiPackage.entryPoints.push(entryPoint);
		apiModel.packages.push(apiPackage);
	}

	return apiModel;
}

function addMember(
	parent: MockApiItem,
	kind: ApiItemKind,
	displayName: string,
	options: { readonly canonicalReference?: string; readonly overloadIndex?: number } = {},
): MockApiItem {
	const apiItem: MockApiItem = {
		kind,
		displayName,
		parent,
		canonicalReference: options.canonicalReference ?? `${displayName}:${kind}`,
		members: [],
		...(options.overloadIndex === undefined ? {} : { overloadIndex: options.overloadIndex }),
	};
	parent.members.push(apiItem);
	return apiItem;
}

function createConfig(
	apiModel: MockApiModel,
	options: { readonly exclude?: (apiItem: ApiItem) => boolean } = {},
) {
	return getApiItemTransformationConfigurationWithDefaults({
		apiModel: apiModel as unknown as ApiModel,
		...(options.exclude === undefined ? {} : { exclude: options.exclude }),
		hierarchy: {
			[ApiItemKind.Function]: HierarchyKind.Document,
			getDocumentName: (apiItem, hierarchyConfig) => {
				switch (apiItem.kind) {
					case ApiItemKind.Model:
					case ApiItemKind.Namespace:
					case ApiItemKind.Package: {
						return "index";
					}
					case ApiItemKind.Function: {
						const overloadIndex = (
							apiItem as ApiItem & { readonly overloadIndex: number }
						).overloadIndex;
						return `${apiItem.displayName.toLowerCase()}-${overloadIndex}-function`;
					}
					default: {
						return ApiItemUtilities.createQualifiedDocumentNameForApiItem(
							apiItem,
							hierarchyConfig,
						);
					}
				}
			},
		},
	});
}

function getEntryPoint(apiModel: MockApiModel): MockApiItem {
	const entryPoint = apiModel.packages[0]?.entryPoints[0];
	if (entryPoint === undefined) {
		throw new Error("Mock API model does not contain an entry point.");
	}
	return entryPoint;
}

function createManifest(apiModel: MockApiModel) {
	return createApiLinkManifest(apiModel as unknown as ApiModel, createConfig(apiModel));
}

describe("createApiLinkManifest", () => {
	it("preserves qualified names, kinds, and overload indexes", () => {
		const apiModel = createMockModel();
		const entryPoint = getEntryPoint(apiModel);
		addMember(entryPoint, ApiItemKind.Interface, "Tree");
		addMember(entryPoint, ApiItemKind.Variable, "Tree");
		const treeView = addMember(entryPoint, ApiItemKind.Interface, "TreeView");
		addMember(treeView, ApiItemKind.MethodSignature, "upgradeSchema");
		addMember(entryPoint, ApiItemKind.Function, "overloaded", { overloadIndex: 1 });
		addMember(entryPoint, ApiItemKind.Function, "overloaded", { overloadIndex: 2 });

		const manifest = createManifest(apiModel);

		expect(manifest["test-package"].Tree).toEqual([
			{
				apiType: ApiItemKind.Interface,
				documentPath: "test-package/tree-interface",
			},
			{
				apiType: ApiItemKind.Variable,
				documentPath: "test-package/index",
				headingId: "tree-variable",
			},
		]);
		expect(manifest["test-package"]["TreeView.upgradeSchema"]).toEqual([
			{
				apiType: ApiItemKind.MethodSignature,
				documentPath: "test-package/treeview-interface",
				headingId: "upgradeschema-methodsignature",
			},
		]);
		expect(manifest["test-package"].overloaded).toEqual([
			{
				apiType: ApiItemKind.Function,
				overloadIndex: 1,
				documentPath: "test-package/overloaded-1-function",
			},
			{
				apiType: ApiItemKind.Function,
				overloadIndex: 2,
				documentPath: "test-package/overloaded-2-function",
			},
		]);
	});

	it("omits excluded API items and their descendants", () => {
		const apiModel = createMockModel();
		const entryPoint = getEntryPoint(apiModel);
		const excluded = addMember(entryPoint, ApiItemKind.Namespace, "Excluded");
		addMember(excluded, ApiItemKind.Interface, "Descendant");
		addMember(entryPoint, ApiItemKind.Interface, "Included");
		const config = createConfig(apiModel, {
			exclude: (apiItem) => apiItem.displayName === "Excluded",
		});

		expect(createApiLinkManifest(apiModel as unknown as ApiModel, config)).toEqual({
			"test-package": {
				Included: [
					{
						apiType: ApiItemKind.Interface,
						documentPath: "test-package/included-interface",
					},
				],
			},
		});
	});

	it("coalesces duplicate candidates with the same target", () => {
		const apiModel = createMockModel();
		const entryPoint = getEntryPoint(apiModel);
		addMember(entryPoint, ApiItemKind.Function, "duplicate", {
			canonicalReference: "duplicate:function(1):first",
			overloadIndex: 1,
		});
		addMember(entryPoint, ApiItemKind.Function, "duplicate", {
			canonicalReference: "duplicate:function(1):second",
			overloadIndex: 1,
		});

		expect(createManifest(apiModel)["test-package"].duplicate).toEqual([
			{
				apiType: ApiItemKind.Function,
				overloadIndex: 1,
				documentPath: "test-package/duplicate-1-function",
			},
		]);
	});

	it("rejects duplicate candidates with different targets", () => {
		const apiModel = createMockModel();
		const entryPoint = getEntryPoint(apiModel);
		const firstParent = addMember(entryPoint, ApiItemKind.Class, "Container");
		const secondParent = addMember(entryPoint, ApiItemKind.Interface, "Container");
		addMember(firstParent, ApiItemKind.Method, "duplicate", {
			canonicalReference: "Container#duplicate:member(1)",
			overloadIndex: 1,
		});
		addMember(secondParent, ApiItemKind.Method, "duplicate", {
			canonicalReference: "Container.duplicate:member(1)",
			overloadIndex: 1,
		});

		expect(() => createManifest(apiModel)).toThrow(
			/Duplicate API link candidate.*Container#duplicate:member\(1\).*Container\.duplicate:member\(1\)/,
		);
	});

	it("rejects packages with duplicate unscoped names", () => {
		const apiModel = createMockModel(["@scope-a/duplicate", "@scope-b/duplicate"]);

		expect(() => createManifest(apiModel)).toThrow(
			'Multiple API packages have the unscoped name "duplicate".',
		);
	});
});
