/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { TestHistorian } from "../testHistorian";
import { GitManager } from "@microsoft/fluid-server-services-client";
import { ICreateCommitParams } from "@microsoft/fluid-gitresources";

describe("Test for TestUtils", () => {
    it("Historian", async () => {
        const historian = new TestHistorian();
        const gitManager = new GitManager(historian);
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
});
