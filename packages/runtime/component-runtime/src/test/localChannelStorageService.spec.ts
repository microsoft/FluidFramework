/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITree, FileMode } from "@fluidframework/protocol-definitions";
import { LocalChannelStorageService } from "../localChannelStorageService";

describe("LocalChannelStorageService", () => {
    it("Empty Tree", async () => {
        const tree: ITree = {
            // eslint-disable-next-line no-null/no-null
            id: null,
            entries: [],
        };

        const ss = new LocalChannelStorageService(tree);

        assert.equal(await ss.contains("/"), false);
        assert.deepEqual(await ss.list(""), []);
    });

    it("Top Level Blob", async () => {
        const tree: ITree = {
            // eslint-disable-next-line no-null/no-null
            id: null,
            entries: [
                {
                    mode: FileMode.File,
                    path: "foo",
                    type: "Blob",
                    value: {
                        encoding: "utf8",
                        contents: "bar",
                    },
                },
            ],
        };

        const ss = new LocalChannelStorageService(tree);

        assert.equal(await ss.contains("foo"), true);
        assert.deepStrictEqual(await ss.list(""), ["foo"]);
        assert.equal(await ss.read("foo"),"bar");
    });

    it("Nested Blob", async () => {
        const tree: ITree = {
            // eslint-disable-next-line no-null/no-null
            id: null,
            entries:[
                {
                    mode: FileMode.File,
                    path: "nested",
                    type: "Tree",
                    value: {
                        // eslint-disable-next-line no-null/no-null
                        id: null,
                        entries:[
                            {
                                mode: FileMode.File,
                                path: "foo",
                                type: "Blob",
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

        assert.equal(await ss.contains("nested/foo"), true);
        assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
        assert.equal(await ss.read("nested/foo"), "bar");
    });
});
