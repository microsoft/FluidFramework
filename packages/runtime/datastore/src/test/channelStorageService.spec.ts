/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluidframework/common-utils";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ChannelStorageService } from "../channelStorageService";

describe("ChannelStorageService", () => {
    it("Empty Tree", async () => {
        const tree: ISnapshotTree = {
            blobs: {},
            trees: {},
        };
        const storage: Pick<IDocumentStorageService, "readBlob"> = {
            readBlob: async (id: string) => {
                throw new Error("not implemented");
            },
        };
        const ss = new ChannelStorageService(tree, storage, new TelemetryUTLogger());

        assert.strictEqual(await ss.contains("/"), false);
        assert.deepStrictEqual(await ss.list(""), []);
    });

    it("Top Level Blob", async () => {
        const tree: ISnapshotTree = {
            blobs: {
                foo: "bar",
            },
            trees: {},
        };
        const storage: Pick<IDocumentStorageService, "readBlob"> = {
            readBlob: async (id: string) => {
                return stringToBuffer(id, "utf8");
            },
        };
        const ss = new ChannelStorageService(tree, storage, new TelemetryUTLogger());

        assert.strictEqual(await ss.contains("foo"), true);
        assert.deepStrictEqual(await ss.list(""), ["foo"]);
        assert.deepStrictEqual(await ss.readBlob("foo"), stringToBuffer("bar", "utf8"));
    });

    it("Nested Blob", async () => {
        const tree: ISnapshotTree = {
            blobs: {},
            trees: {
                nested: {
                    blobs: {
                        foo: "bar",
                    },
                    trees: {},
                },
            },
        };
        const storage: Pick<IDocumentStorageService, "readBlob"> = {
            readBlob: async (id: string) => {
                return stringToBuffer(id, "utf8");
            },
        };
        const ss = new ChannelStorageService(tree, storage, new TelemetryUTLogger());

        assert.strictEqual(await ss.contains("nested/foo"), true);
        assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
        assert.deepStrictEqual(await ss.readBlob("nested/foo"), stringToBuffer("bar", "utf8"));
    });
});
