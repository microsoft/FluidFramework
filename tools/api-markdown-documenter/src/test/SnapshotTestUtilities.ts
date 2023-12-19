/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FileSystem, NewlineKind } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";

import { type FileSystemConfiguration } from "../FileSystemConfiguration";

/**
 * Compares "expected" to "actual" documentation test suite output.
 * Succeeds the Mocha test if the directory contents match.
 * Otherwise, fails the test and copies the new output to the snapshot directory so the developer can view the diff
 * in git, and check in the changes if appropriate.
 *
 * @param snapshotDirectoryPath - Resolved path to the directory containing the checked-in assets for the test.
 * Represents the "expected" test output.
 *
 * @param outputDirectoryPath - Resolved path to the directory containing the freshly generated test output.
 * Represents the "actual" test output.
 *
 * @param render - Function to render the documentation output to `tempDirectoryPath`.
 */
export async function compareDocumentationSuiteSnapshot(
	snapshotDirectoryPath: string,
	outputDirectoryPath: string,
	render: (fsConfig: FileSystemConfiguration) => Promise<void>,
): Promise<void> {
	// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
	await FileSystem.ensureFolderAsync(outputDirectoryPath);
	await FileSystem.ensureFolderAsync(snapshotDirectoryPath);

	// Clear any existing test_temp data
	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	// Run transformation and rendering logic
	const fileSystemConfig = {
		outputDirectoryPath,
		newlineKind: NewlineKind.Lf,
	};
	await render(fileSystemConfig);

	// Verify against expected contents
	const result = await compare(outputDirectoryPath, snapshotDirectoryPath, {
		compareContent: true,
	});

	if (!result.same) {
		await FileSystem.ensureEmptyFolderAsync(snapshotDirectoryPath);
		await FileSystem.copyFilesAsync({
			sourcePath: outputDirectoryPath,
			destinationPath: snapshotDirectoryPath,
		});
	}

	// If this fails, then the docs build has generated new content.
	// View the diff in git and determine if the changes are appropriate or not.
	expect(result.same).to.be.true;
}
