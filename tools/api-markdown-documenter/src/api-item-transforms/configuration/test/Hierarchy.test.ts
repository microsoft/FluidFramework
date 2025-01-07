/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApiItemKind } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import {
	FolderDocumentPlacement,
	getHierarchyConfigurationWithDefaults,
	HierarchyKind,
	type DocumentHierarchyConfiguration,
	type FolderHierarchyConfiguration,
	type HierarchyConfiguration,
	type HierarchyOptions,
	type SectionHierarchyConfiguration,
} from "../Hierarchy.js";

describe("Hierarchy configuration unit tests", () => {
	describe("getHierarchyConfigurationWithDefaults", () => {
		const defaultDocumentName = "foo";
		const defaultFolderName = "bar";

		const expectedDefaultSectionConfig: SectionHierarchyConfiguration = {
			kind: HierarchyKind.Section,
		};

		const expectedDefaultDocumentConfig: DocumentHierarchyConfiguration = {
			kind: HierarchyKind.Document,
			documentName: defaultDocumentName,
		};

		const expectedDefaultFolderConfig: FolderHierarchyConfiguration = {
			kind: HierarchyKind.Folder,
			documentName: defaultDocumentName,
			documentPlacement: FolderDocumentPlacement.Outside,
			folderName: defaultFolderName,
		};

		const expectedDefaultHierarchyConfig: HierarchyConfiguration = {
			// Items that introduce folder hierarchy:
			[ApiItemKind.Namespace]: expectedDefaultFolderConfig,
			[ApiItemKind.Package]: expectedDefaultFolderConfig,

			// Items that get their own document, but do not introduce folder hierarchy:
			[ApiItemKind.Class]: expectedDefaultDocumentConfig,
			[ApiItemKind.Enum]: expectedDefaultSectionConfig, // TODO: Document
			[ApiItemKind.EntryPoint]: expectedDefaultDocumentConfig,
			[ApiItemKind.Interface]: expectedDefaultDocumentConfig,
			[ApiItemKind.Model]: expectedDefaultDocumentConfig,
			[ApiItemKind.TypeAlias]: expectedDefaultSectionConfig, // TODO: Document

			// Items that get a section under the document representing an ancestor of the API item:
			[ApiItemKind.CallSignature]: expectedDefaultSectionConfig,
			[ApiItemKind.Constructor]: expectedDefaultSectionConfig,
			[ApiItemKind.ConstructSignature]: expectedDefaultSectionConfig,
			[ApiItemKind.EnumMember]: expectedDefaultSectionConfig,
			[ApiItemKind.Function]: expectedDefaultSectionConfig,
			[ApiItemKind.IndexSignature]: expectedDefaultSectionConfig,
			[ApiItemKind.Method]: expectedDefaultSectionConfig,
			[ApiItemKind.MethodSignature]: expectedDefaultSectionConfig,
			[ApiItemKind.Property]: expectedDefaultSectionConfig,
			[ApiItemKind.PropertySignature]: expectedDefaultSectionConfig,
			[ApiItemKind.Variable]: expectedDefaultSectionConfig,
		};

		it("Empty input", () => {
			const result = getHierarchyConfigurationWithDefaults(
				undefined,
				defaultDocumentName,
				defaultFolderName,
			);

			expect(result).to.deep.equal(expectedDefaultHierarchyConfig);
		});

		it("Input contains overrides", () => {
			const input: HierarchyOptions = {
				[ApiItemKind.Class]: HierarchyKind.Section,
				[ApiItemKind.Interface]: {
					kind: HierarchyKind.Folder,
					folderName: "baz",
				},
			};

			const result = getHierarchyConfigurationWithDefaults(
				input,
				defaultDocumentName,
				defaultFolderName,
			);

			const expected: HierarchyConfiguration = {
				...expectedDefaultHierarchyConfig,
				[ApiItemKind.Class]: {
					kind: HierarchyKind.Section,
				},
				[ApiItemKind.Interface]: {
					kind: HierarchyKind.Folder,
					documentName: defaultDocumentName,
					documentPlacement: FolderDocumentPlacement.Outside,
					folderName: "baz",
				},
			};

			expect(result).to.deep.equal(expected);
		});
	});
});
