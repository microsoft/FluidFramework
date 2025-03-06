/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TestHistorian } from "../testHistorian";
import { GitManager } from "@fluidframework/server-services-client";
import { ICreateBlobParams, ICreateCommitParams } from "@fluidframework/gitresources";
import { fromUtf8ToBase64 } from "@fluidframework/server-services-core";

describe("Test for Historian", () => {
	let gitManager: GitManager;
	beforeEach(async () => {
		const historian = new TestHistorian();
		gitManager = new GitManager(historian);
	});

	it("Commit Test", async () => {
		const documentId = "documentId";
		const commitParams: ICreateCommitParams = {
			author: {
				date: new Date().toISOString(),
				email: "dummy@microsoft.com",
				name: "Routerlicious Service",
			},
			message: "New document",
			parents: [],
			tree: "tree",
		};
		const putCommit = await gitManager.createCommit(commitParams);
		await gitManager.createRef(documentId, putCommit.sha);
		const getCommit = await gitManager.getCommit(documentId);
		assert.equal(getCommit.sha, putCommit.sha, "Sha not equal of commits!!");
		assert.equal(getCommit.message, commitParams.message, "Message not equal of commits!!");
	});

	it("Blob Test for insertion of duplicate blobs", async () => {
		const historian = new TestHistorian();
		const gitManager = new GitManager(historian);
		const blob1: ICreateBlobParams = {
			content: "content",
			encoding: "utf-8",
		};
		const blob2: ICreateBlobParams = {
			content: fromUtf8ToBase64(blob1.content),
			encoding: "base64",
		};
		const createBlobResponse1 = await gitManager.createBlob(blob1.content, blob1.encoding);
		const createBlobResponse2 = await gitManager.createBlob(blob2.content, blob2.encoding);
		assert.strictEqual(
			createBlobResponse1.sha,
			createBlobResponse2.sha,
			"Sha for both blobs should match as only 1 blob is stored as contents of both are same",
		);
	});
});
