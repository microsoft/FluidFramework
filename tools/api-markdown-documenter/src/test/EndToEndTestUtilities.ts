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
	FolderDocumentPlacement,
	HierarchyKind,
	type FolderHierarchyConfiguration,
	type HierarchyOptions,
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
 * Test hierarchy configurations
 *
 * @privateRemarks TODO: Formalize and export some of these as pre-canned solutions?
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HierarchyConfigurations {
	const outsideFolderConfig: FolderHierarchyConfiguration = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Outside,
	};

	const insideFolderOptions: FolderHierarchyConfiguration = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Inside,
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
	 * "Sparse" hierarchy: Packages yield folder hierarchy, and each descendent item gets its own document under that folder.
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

	// TODO
	// /**
	//  * "Deep" hierarchy: All "parent" API items generate hierarchy. All other items are rendered as documents under their parent hierarchy.
	//  * @remarks Leads to many documents, but each document is likely to be relatively small.
	//  */
	// export const deep: HierarchyOptions = {
	// 	// Items that introduce folder hierarchy:
	// 	[ApiItemKind.Namespace]: insideFolderOptions,
	// 	[ApiItemKind.Package]: insideFolderOptions,
	// 	[ApiItemKind.Class]: insideFolderOptions,
	// 	[ApiItemKind.Enum]: insideFolderOptions,
	// 	[ApiItemKind.Interface]: insideFolderOptions,
	// 	[ApiItemKind.TypeAlias]: insideFolderOptions,

	// 	// Items that get their own document, but do not introduce folder hierarchy:
	// 	[ApiItemKind.CallSignature]: HierarchyKind.Document,
	// 	[ApiItemKind.Constructor]: HierarchyKind.Document,
	// 	[ApiItemKind.ConstructSignature]: HierarchyKind.Document,
	// 	[ApiItemKind.EnumMember]: HierarchyKind.Document,
	// 	[ApiItemKind.Function]: HierarchyKind.Document,
	// 	[ApiItemKind.IndexSignature]: HierarchyKind.Document,
	// 	[ApiItemKind.Method]: HierarchyKind.Document,
	// 	[ApiItemKind.MethodSignature]: HierarchyKind.Document,
	// 	[ApiItemKind.Property]: HierarchyKind.Document,
	// 	[ApiItemKind.PropertySignature]: HierarchyKind.Document,
	// 	[ApiItemKind.Variable]: HierarchyKind.Document,

	// 	getDocumentName: (apiItem, config): string => {
	// 		switch (apiItem.kind) {
	// 			case ApiItemKind.Model:
	// 			case ApiItemKind.Package:
	// 			case ApiItemKind.Namespace:
	// 			case ApiItemKind.Class:
	// 			case ApiItemKind.Enum:
	// 			case ApiItemKind.Interface:
	// 			case ApiItemKind.TypeAlias: {
	// 				return "index";
	// 			}
	// 			default: {
	// 				// Let the system generate a unique name that accounts for folder hierarchy.
	// 				return ApiItemUtilities.createQualifiedDocumentNameForApiItem(apiItem, config);
	// 			}
	// 		}
	// 	},
	// };
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
