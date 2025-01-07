/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItemKind, type ApiItem } from "@microsoft/api-extractor-model";
import { assert, expect } from "chai";

import { getValueOrDerived } from "../../../utilities/index.js";
import {
	getDocumentationSuiteConfigurationWithDefaults,
	type DocumentationSuiteOptions,
} from "../DocumentationSuite.js";
import { HierarchyKind } from "../Hierarchy.js";

describe("Documentation Suite configuration unit tests", () => {
	describe("getDocumentationSuiteConfigurationWithDefaults", () => {
		it("Hierarchy settings are applied correctly", () => {
			const input: DocumentationSuiteOptions = {
				hierarchy: {
					[ApiItemKind.Variable]: HierarchyKind.Section,
					[ApiItemKind.TypeAlias]: HierarchyKind.Document,
					[ApiItemKind.Class]: {
						kind: HierarchyKind.Document,
						documentName: "foo",
					},
					[ApiItemKind.Interface]: {
						kind: HierarchyKind.Folder,
						documentName: (apiItem) => `${apiItem.displayName}!`,
					},
				},
				documentName: (apiItem) => `d_${apiItem.displayName}`,
				folderName: (apiItem) => `f_${apiItem.displayName}`,
			};

			const config = getDocumentationSuiteConfigurationWithDefaults(input);

			const variableHierarchy = config.hierarchy[ApiItemKind.Variable];
			assert(variableHierarchy.kind === HierarchyKind.Section);

			const typeAliasItem = {
				kind: ApiItemKind.TypeAlias,
				displayName: "type-alias",
			} as unknown as ApiItem;
			const typeAliasHierarchy = config.hierarchy[ApiItemKind.TypeAlias];
			assert(typeAliasHierarchy.kind === HierarchyKind.Document);
			expect(getValueOrDerived(typeAliasHierarchy.documentName, typeAliasItem)).to.equal(
				"d_type-alias",
			);

			const classItem = {
				kind: ApiItemKind.Class,
				displayName: "class",
			} as unknown as ApiItem;
			const classHierarchy = config.hierarchy[ApiItemKind.Class];
			assert(classHierarchy.kind === HierarchyKind.Document);
			expect(getValueOrDerived(classHierarchy.documentName, classItem)).to.equal("foo");

			const interfaceItem = {
				kind: ApiItemKind.Interface,
				displayName: "interface",
			} as unknown as ApiItem;
			const interfaceHierarchy = config.hierarchy[ApiItemKind.Interface];
			assert(interfaceHierarchy.kind === HierarchyKind.Folder);
			expect(getValueOrDerived(interfaceHierarchy.documentName, interfaceItem)).to.equal(
				"interface!",
			);
			expect(getValueOrDerived(interfaceHierarchy.folderName, interfaceItem)).to.equal(
				"f_interface",
			);
		});
	});
});
