/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	IRepoManagerParams,
	IsomorphicGitManagerFactory,
	MemFsManagerFactory,
	SystemErrors,
} from "../utils";
import { NullExternalStorageManager } from "../externalStorageManager";

/**
 * Get a string that cannot be compressed by zlib.
 * http://blog.chenshuo.com/2014/05/incompressible-zlibdeflate-data.html
 * @param length - The length of the string to generate (substring of the incompressible string).
 */
function getIncompressibleString(length: number): string {
	const incompressible = [];
	for (let step = 1; step <= 128; ++step) {
		for (let inc = 0; inc < step; ++inc) {
			for (let i = inc; i < 256; i += step) {
				incompressible.push(String.fromCharCode(i));
			}
		}
	}
	if (length > incompressible.length) {
		throw new Error(
			`Requested incompressible string length ${length} is greater than the maximum possible length ${incompressible.length}`,
		);
	}
	return incompressible.join("").substring(0, length);
}

describe("isomorphic-git manager", () => {
	/**
	 * The maximum file size that can be created in the filesystem.
	 * This will be applied _after_ compression.
	 */
	const fsMaxFileSizeBytes = 5 * 1024;
	/**
	 * The maximum file size that can be created in the git repository.
	 * This will be applied _before_ compression.
	 *
	 * This is 3x larger than fsMaxFileSizeBytes to ensure that we can accurately
	 * test the size limits of the filesystem distinctly from the git repository.
	 */
	const gitMaxFileSizeBytes = 3 * fsMaxFileSizeBytes;
	const fsFactory = new MemFsManagerFactory(fsMaxFileSizeBytes);
	const repoManagerFactory = new IsomorphicGitManagerFactory(
		{ useRepoOwner: false },
		{ defaultFileSystemManagerFactory: fsFactory },
		new NullExternalStorageManager(),
		true /* repoPerDocEnabled */,
		false /* enableRepositoryManagerMetrics */,
		true /* enableSlimGitInit */,
	);
	const repoManagerParams: Required<IRepoManagerParams> = {
		repoOwner: "fluid",
		repoName: "test",
		storageRoutingId: {
			tenantId: "fluid",
			documentId: "test",
		},
		fileSystemManagerParams: {
			rootDir: "/",
		},
		optimizeForInitialSummary: true,
		isEphemeralContainer: false,
	};

	it("should create/read a blob", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		const base64BlobContents = Buffer.from("Hello, World!", "utf-8").toString("base64");
		const createBlobResponse = await repoManager.createBlob({
			content: base64BlobContents,
			encoding: "base64",
		});
		const readBlobResponse = await repoManager.getBlob(createBlobResponse.sha);
		assert.strictEqual(readBlobResponse.content, base64BlobContents);
		assert.strictEqual(readBlobResponse.encoding, "base64");
		assert.strictEqual(readBlobResponse.sha, createBlobResponse.sha);
		assert.strictEqual(readBlobResponse.size, base64BlobContents.length);
	});

	it("should not create a too large blob (uncompressible)", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		/**
		 * A blob of all "a"s that is one byte larger than the maximum allowed size
		 * This blob is highly compressible, so it will go around any filesystem level size limits
		 * after isomorphic-git uses Pako deflate (zlib) to compress it.
		 */
		const base64BlobContents = Buffer.from(
			getIncompressibleString(fsMaxFileSizeBytes + 1),
		).toString("base64");
		assert(
			base64BlobContents.length > fsMaxFileSizeBytes,
			`Blob size: ${base64BlobContents.length} should be greater than ${fsMaxFileSizeBytes}`,
		);
		await assert.rejects(
			async () =>
				await repoManager.createBlob({
					content: base64BlobContents,
					encoding: "base64",
				}),
			{
				name: "FilesystemError",
				code: SystemErrors.EFBIG.code,
			},
		);
	});

	it("should not create a too large blob (compressible)", async () => {
		const repoManager = await repoManagerFactory.create(repoManagerParams);
		/**
		 * A blob of all "a"s that is one byte larger than the maximum allowed size
		 * This blob is highly compressible, so it will go around any filesystem level size limits
		 * after isomorphic-git uses Pako deflate (zlib) to compress it.
		 */
		const base64BlobContents = Buffer.from("a".repeat(gitMaxFileSizeBytes + 1)).toString(
			"base64",
		);
		assert(
			base64BlobContents.length > gitMaxFileSizeBytes,
			`Blob size: ${base64BlobContents.length} should be greater than ${fsMaxFileSizeBytes}`,
		);
		await assert.rejects(
			async () =>
				await repoManager.createBlob({
					content: base64BlobContents,
					encoding: "base64",
				}),
			{
				name: "FilesystemError",
				code: SystemErrors.EFBIG,
			},
		);
	});
});
