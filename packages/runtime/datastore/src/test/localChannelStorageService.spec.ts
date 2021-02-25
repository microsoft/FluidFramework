/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer, bufferToString } from "@fluidframework/common-utils";
import { ITree, FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { LocalChannelStorageService } from "../localChannelStorageService";

describe("LocalChannelStorageService", () => {
    it("Empty Tree", async () => {
        const tree: ITree = {
            entries: [],
        };

        const ss = new LocalChannelStorageService(tree);

        assert.strictEqual(await ss.contains("/"), false);
        assert.deepStrictEqual(await ss.list(""), []);
        try {
            await ss.readBlob("test");
        } catch (error) {
            assert.strictEqual(error.message, "Blob Not Found");
        }
    });

    it("Top Level Blob", async () => {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: "foo",
                    type: TreeEntry.Blob,
                    value: {
                        encoding: "utf8",
                        contents: "bar",
                    },
                },
            ],
        };

        const ss = new LocalChannelStorageService(tree);

        assert.strictEqual(await ss.contains("foo"), true);
        assert.deepStrictEqual(await ss.list(""), ["foo"]);
        assert.strictEqual(bufferToString(await ss.readBlob("foo"), "utf8"), "bar");
        assert.deepStrictEqual(await ss.readBlob("foo"), stringToBuffer("bar","utf8"));
    });

    it("Nested Blob", async () => {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: "nested",
                    type: TreeEntry.Tree,
                    value: {
                        entries: [
                            {
                                mode: FileMode.File,
                                path: "foo",
                                type: TreeEntry.Blob,
                                value: {
                                    encoding: "utf8",
                                    contents: "bar",
                                },
                            },
                        ],
                    },
                },
            ],
        };
        const ss = new LocalChannelStorageService(tree);

        assert.strictEqual(await ss.contains("nested/foo"), true);
        assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
        assert.strictEqual(bufferToString(await ss.readBlob("nested/foo"), "utf-8"), "bar");
        assert.deepStrictEqual(await ss.readBlob("nested/foo"), stringToBuffer("bar","utf8"));
    });
});
