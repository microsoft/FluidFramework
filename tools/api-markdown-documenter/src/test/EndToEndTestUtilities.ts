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
	defaultSectionHierarchyConfig,
	defaultHeadingText,
	defaultDocumentHierarchyConfig,
	defaultFolderName,
	defaultDocumentName,
} from "../api-item-transforms/index.js";
import {
	FolderDocumentPlacement,
	HierarchyKind,
	type HierarchyConfiguration,
	type FolderHierarchyConfiguration,
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
	const outsideFolderConfig: FolderHierarchyConfiguration = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Outside,
		documentName: defaultDocumentName,
		folderName: defaultFolderName,
		headingText: (apiItem) => apiItem.displayName,
	};

	const insideFolderConfig: FolderHierarchyConfiguration = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Inside,
		documentName: "index",
		folderName: defaultFolderName,
		headingText: defaultHeadingText,
	};

	/**
	 * "Flat" hierarchy: Packages get their own documents, and all descendent API items are rendered as sections under that document.
	 * @remarks Results in a small number of documents, but can lead to relatively large documents.
	 */
	export const flat: Partial<HierarchyConfiguration> = {
		[ApiItemKind.Package]: defaultDocumentHierarchyConfig,

		[ApiItemKind.CallSignature]: defaultSectionHierarchyConfig,
		[ApiItemKind.Class]: defaultSectionHierarchyConfig,
		[ApiItemKind.Constructor]: defaultSectionHierarchyConfig,
		[ApiItemKind.ConstructSignature]: defaultSectionHierarchyConfig,
		[ApiItemKind.Enum]: defaultSectionHierarchyConfig,
		[ApiItemKind.EnumMember]: defaultSectionHierarchyConfig,
		[ApiItemKind.Function]: defaultSectionHierarchyConfig,
		[ApiItemKind.IndexSignature]: defaultSectionHierarchyConfig,
		[ApiItemKind.Interface]: defaultSectionHierarchyConfig,
		[ApiItemKind.Method]: defaultSectionHierarchyConfig,
		[ApiItemKind.MethodSignature]: defaultSectionHierarchyConfig,
		[ApiItemKind.Namespace]: defaultSectionHierarchyConfig,
		[ApiItemKind.Property]: defaultSectionHierarchyConfig,
		[ApiItemKind.PropertySignature]: defaultSectionHierarchyConfig,
		[ApiItemKind.TypeAlias]: defaultSectionHierarchyConfig,
		[ApiItemKind.Variable]: defaultSectionHierarchyConfig,
	};

	/**
	 * "Sparse" hierarchy: Packages yield folder hierarchy, and all descendent items get their own document under that folder.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const sparse: Partial<HierarchyConfiguration> = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Class]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Constructor]: defaultDocumentHierarchyConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Enum]: defaultDocumentHierarchyConfig,
		[ApiItemKind.EnumMember]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Function]: defaultDocumentHierarchyConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Interface]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Method]: defaultDocumentHierarchyConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Namespace]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Property]: defaultDocumentHierarchyConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.TypeAlias]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Variable]: defaultDocumentHierarchyConfig,
	};

	/**
	 * "Deep" hierarchy: All "parent" API items generate hierarchy. All other items are rendered as documents under their parent hierarchy.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const deep: Partial<HierarchyConfiguration> = {
		// Items that introduce folder hierarchy:
		[ApiItemKind.Namespace]: insideFolderConfig,
		[ApiItemKind.Package]: insideFolderConfig,
		[ApiItemKind.Class]: insideFolderConfig,
		[ApiItemKind.Enum]: insideFolderConfig,
		[ApiItemKind.Interface]: insideFolderConfig,
		[ApiItemKind.TypeAlias]: insideFolderConfig,

		// Items that get their own document, but do not introduce folder hierarchy:
		[ApiItemKind.CallSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Constructor]: defaultDocumentHierarchyConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.EnumMember]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Function]: defaultDocumentHierarchyConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Method]: defaultDocumentHierarchyConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Property]: defaultDocumentHierarchyConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentHierarchyConfig,
		[ApiItemKind.Variable]: defaultDocumentHierarchyConfig,
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
