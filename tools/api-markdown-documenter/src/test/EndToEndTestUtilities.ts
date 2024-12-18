/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiItemKind } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";

import {
	ApiItemUtilities,
	type DocumentHierarchyConfig,
	FolderDocumentPlacement,
	HierarchyKind,
	type HierarchyOptions,
	type FolderHierarchyConfig,
	type SectionHierarchyConfig,
} from "../index.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
export const testTemporaryDirectoryPath = Path.resolve(dirname, "test_temp");

/**
 * Snapshot directory to which generated test data will be copied.
 * @remarks Relative to lib/test
 */
export const snapshotsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "snapshots");

/**
 * Directory containing the end-to-end test models.
 * @remarks Relative to lib/test
 */
export const testDataDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

/**
 * Test hierarchy configs
 *
 * @privateRemarks TODO: Formalize and export some of these as pre-canned solutions?
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HierarchyConfigs {
	const defaultSectionConfig: SectionHierarchyConfig = {
		kind: HierarchyKind.Section,
		headingText: (apiItem) => apiItem.displayName,
	};

	const defaultDocumentConfig: DocumentHierarchyConfig = {
		kind: HierarchyKind.Document,
		documentName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	const outsideFolderConfig: FolderHierarchyConfig = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Outside,
		documentName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		folderName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	const insideFolderConfig: FolderHierarchyConfig = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Inside,
		documentName: "index",
		folderName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	/**
	 * "Flat" hierarchy: Packages get their own documents, and all descendent API items are rendered as sections under that document.
	 * @remarks Results in a small number of documents, but can lead to relatively large documents.
	 */
	export const flat: Partial<HierarchyOptions> = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: defaultSectionConfig,
		[ApiItemKind.Class]: defaultSectionConfig,
		[ApiItemKind.Constructor]: defaultSectionConfig,
		[ApiItemKind.ConstructSignature]: defaultSectionConfig,
		[ApiItemKind.Enum]: defaultSectionConfig,
		[ApiItemKind.EnumMember]: defaultSectionConfig,
		[ApiItemKind.Function]: defaultSectionConfig,
		[ApiItemKind.IndexSignature]: defaultSectionConfig,
		[ApiItemKind.Interface]: defaultSectionConfig,
		[ApiItemKind.Method]: defaultSectionConfig,
		[ApiItemKind.MethodSignature]: defaultSectionConfig,
		[ApiItemKind.Property]: defaultSectionConfig,
		[ApiItemKind.PropertySignature]: defaultSectionConfig,
		[ApiItemKind.TypeAlias]: defaultSectionConfig,
		[ApiItemKind.Variable]: defaultSectionConfig,
	};

	/**
	 * "Sparse" hierarchy: Packages yield folder hierarchy, and all descendent items get their own document under that folder.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const sparse: Partial<HierarchyOptions> = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: defaultDocumentConfig,
		[ApiItemKind.Class]: defaultDocumentConfig,
		[ApiItemKind.Constructor]: defaultDocumentConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentConfig,
		[ApiItemKind.Enum]: defaultDocumentConfig,
		[ApiItemKind.EnumMember]: defaultDocumentConfig,
		[ApiItemKind.Function]: defaultDocumentConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentConfig,
		[ApiItemKind.Interface]: defaultDocumentConfig,
		[ApiItemKind.Method]: defaultDocumentConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentConfig,
		[ApiItemKind.Namespace]: defaultDocumentConfig,
		[ApiItemKind.Property]: defaultDocumentConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentConfig,
		[ApiItemKind.TypeAlias]: defaultDocumentConfig,
		[ApiItemKind.Variable]: defaultDocumentConfig,
	};

	/**
	 * "Deep" hierarchy: All "parent" API items generate hierarchy. All other items are rendered as documents under their parent hierarchy.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const deep: Partial<HierarchyOptions> = {
		// Items that introduce folder hierarchy:
		[ApiItemKind.Namespace]: insideFolderConfig,
		[ApiItemKind.Package]: insideFolderConfig,
		[ApiItemKind.Class]: insideFolderConfig,
		[ApiItemKind.Enum]: insideFolderConfig,
		[ApiItemKind.Interface]: insideFolderConfig,
		[ApiItemKind.TypeAlias]: insideFolderConfig,

		// Items that get their own document, but do not introduce folder hierarchy:
		[ApiItemKind.CallSignature]: defaultDocumentConfig,
		[ApiItemKind.Constructor]: defaultDocumentConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentConfig,
		[ApiItemKind.EnumMember]: defaultDocumentConfig,
		[ApiItemKind.Function]: defaultDocumentConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentConfig,
		[ApiItemKind.Method]: defaultDocumentConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentConfig,
		[ApiItemKind.Property]: defaultDocumentConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentConfig,
		[ApiItemKind.Variable]: defaultDocumentConfig,
	};
}

/**
 * Compares "expected" to "actual" documentation test suite output.
 * Succeeds the Mocha test if the directory contents match.
 * Otherwise, fails the test and copies the new output to the snapshot directory so the developer can view the diff
 * in git, and check in the changes if appropriate.
 *
 * @param snapshotDirectoryPath - Resolved path to the directory containing the checked-in assets for the test.
 * Represents the "expected" test output.
 *
 * @param temporaryDirectoryPath - Resolved path to the directory containing the freshly generated test output.
 * Represents the "actual" test output.
 */
export async function compareDocumentationSuiteSnapshot(
	snapshotDirectoryPath: string,
	temporaryDirectoryPath: string,
): Promise<void> {
	// Verify against expected contents
	const result = await compare(temporaryDirectoryPath, snapshotDirectoryPath, {
		compareContent: true,
	});

	if (!result.same) {
		await FileSystem.ensureEmptyFolderAsync(snapshotDirectoryPath);
		await FileSystem.copyFilesAsync({
			sourcePath: temporaryDirectoryPath,
			destinationPath: snapshotDirectoryPath,
		});

		expect.fail(`Snapshot test encountered ${result.differencesFiles} file diffs.`);
	}
}
