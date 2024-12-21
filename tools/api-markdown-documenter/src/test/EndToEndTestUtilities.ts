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

import { defaultFolderHierarchyConfig } from "../api-item-transforms/index.js";
import {
	FolderDocumentPlacement,
	HierarchyKind,
	type HierarchyOptions,
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
		folderName: defaultFolderHierarchyConfig.folderName,
	};

	const insideFolderConfig: FolderHierarchyConfiguration = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Inside,
		documentName: "index",
		folderName: defaultFolderHierarchyConfig.folderName,
	};

	/**
	 * "Flat" hierarchy: Packages get their own documents, and all descendent API items are rendered as sections under that document.
	 * @remarks Results in a small number of documents, but can lead to relatively large documents.
	 */
	export const flat: HierarchyOptions = {
		[ApiItemKind.Package]: HierarchyKind.Document,

		[ApiItemKind.CallSignature]: HierarchyKind.Section,
		[ApiItemKind.Class]: HierarchyKind.Section,
		[ApiItemKind.Constructor]: HierarchyKind.Section,
		[ApiItemKind.ConstructSignature]: HierarchyKind.Section,
		[ApiItemKind.Enum]: HierarchyKind.Section,
		[ApiItemKind.EnumMember]: HierarchyKind.Section,
		[ApiItemKind.Function]: HierarchyKind.Section,
		[ApiItemKind.IndexSignature]: HierarchyKind.Section,
		[ApiItemKind.Interface]: HierarchyKind.Section,
		[ApiItemKind.Method]: HierarchyKind.Section,
		[ApiItemKind.MethodSignature]: HierarchyKind.Section,
		[ApiItemKind.Namespace]: HierarchyKind.Section,
		[ApiItemKind.Property]: HierarchyKind.Section,
		[ApiItemKind.PropertySignature]: HierarchyKind.Section,
		[ApiItemKind.TypeAlias]: HierarchyKind.Section,
		[ApiItemKind.Variable]: HierarchyKind.Section,
	};

	/**
	 * "Sparse" hierarchy: Packages yield folder hierarchy, and all descendent items get their own document under that folder.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const sparse: HierarchyOptions = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: HierarchyKind.Document,
		[ApiItemKind.Class]: HierarchyKind.Document,
		[ApiItemKind.Constructor]: HierarchyKind.Document,
		[ApiItemKind.ConstructSignature]: HierarchyKind.Document,
		[ApiItemKind.Enum]: HierarchyKind.Document,
		[ApiItemKind.EnumMember]: HierarchyKind.Document,
		[ApiItemKind.Function]: HierarchyKind.Document,
		[ApiItemKind.IndexSignature]: HierarchyKind.Document,
		[ApiItemKind.Interface]: HierarchyKind.Document,
		[ApiItemKind.Method]: HierarchyKind.Document,
		[ApiItemKind.MethodSignature]: HierarchyKind.Document,
		[ApiItemKind.Namespace]: HierarchyKind.Document,
		[ApiItemKind.Property]: HierarchyKind.Document,
		[ApiItemKind.PropertySignature]: HierarchyKind.Document,
		[ApiItemKind.TypeAlias]: HierarchyKind.Document,
		[ApiItemKind.Variable]: HierarchyKind.Document,
	};

	/**
	 * "Deep" hierarchy: All "parent" API items generate hierarchy. All other items are rendered as documents under their parent hierarchy.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const deep: HierarchyOptions = {
		// Items that introduce folder hierarchy:
		[ApiItemKind.Namespace]: insideFolderConfig,
		[ApiItemKind.Package]: insideFolderConfig,
		[ApiItemKind.Class]: insideFolderConfig,
		[ApiItemKind.Enum]: insideFolderConfig,
		[ApiItemKind.Interface]: insideFolderConfig,
		[ApiItemKind.TypeAlias]: insideFolderConfig,

		// Items that get their own document, but do not introduce folder hierarchy:
		[ApiItemKind.CallSignature]: HierarchyKind.Document,
		[ApiItemKind.Constructor]: HierarchyKind.Document,
		[ApiItemKind.ConstructSignature]: HierarchyKind.Document,
		[ApiItemKind.EnumMember]: HierarchyKind.Document,
		[ApiItemKind.Function]: HierarchyKind.Document,
		[ApiItemKind.IndexSignature]: HierarchyKind.Document,
		[ApiItemKind.Method]: HierarchyKind.Document,
		[ApiItemKind.MethodSignature]: HierarchyKind.Document,
		[ApiItemKind.Property]: HierarchyKind.Document,
		[ApiItemKind.PropertySignature]: HierarchyKind.Document,
		[ApiItemKind.Variable]: HierarchyKind.Document,
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
