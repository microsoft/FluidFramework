/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ChannelStorageService } from "../channelStorageService";

describe("ChannelStorageService", () => {
    it("Empty Tree", async () => {
        const tree: ISnapshotTree = {
            blobs: {},
            commits: {},
            // eslint-disable-next-line no-null/no-null
            id: null,
            trees: {},
        };
        const storage: Pick<IDocumentStorageService, "read"> = {
            read: async (id: string) => {
                assert.fail();
            },
        };
        const ss = new ChannelStorageService(Promise.resolve(tree), storage);

        assert.equal(await ss.contains("/"), false);
        assert.deepEqual(await ss.list(""), []);
    });

    it("Top Level Blob", async () => {
        const tree: ISnapshotTree = {
            blobs: {
                foo: "bar",
            },
            commits: {},
            // eslint-disable-next-line no-null/no-null
            id: null,
            trees: {},
        };
        const storage: Pick<IDocumentStorageService, "read"> = {
            read: async (id: string) => {
                return id;
            },
        };
        const ss = new ChannelStorageService(Promise.resolve(tree), storage);

        assert.equal(await ss.contains("foo"), true);
        assert.deepStrictEqual(await ss.list(""), ["foo"]);
        assert.equal(await ss.read("foo"),"bar");
    });

    it("Nested Blob", async () => {
        const tree: ISnapshotTree = {
            blobs: {},
            commits: {},
            // eslint-disable-next-line no-null/no-null
            id: null,
            trees: {
                nested:{
                    blobs: {
                        foo: "bar",
                    },
                    commits: {},
                    // eslint-disable-next-line no-null/no-null
                    id: null,
                    trees: {},
                },
            },
        };
        const storage: Pick<IDocumentStorageService, "read"> = {
            read: async (id: string) => {
                return id;
            },
        };
        const ss = new ChannelStorageService(Promise.resolve(tree), storage);

        assert.equal(await ss.contains("nested/foo"), true);
        assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
        assert.equal(await ss.read("nested/foo"), "bar");
    });
});
