/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UnassignedSequenceNumber } from "../constants";
import { MergeTreeDeltaType } from "../ops";
import { TestClient } from "./testClient";
import { insertText } from "./testUtils";

describe.skip("obliterate", () => {
    let client: TestClient;
    let refSeq: number;
    const localClientId = 17;
    const remoteClientId = 18;

    beforeEach(() => {
        client = new TestClient();
        client.startOrUpdateCollaboration("local");
        for (const char of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), char),
                    client.getCurrentSeq() + 1));
        }
        assert.equal(client.getText(), "hello world");
        refSeq = client.getCurrentSeq();
    });

    it("removes text", () => {
        client.obliterateRange(
            0,
            client.getLength(),
            refSeq,
            localClientId,
            refSeq + 1,
            false,
            undefined as any,
        );
        assert.equal(client.getText(), "");
    });

    describe("concurrent obliterate and insert", () => {
        it("removes text for obliterate then insert", () => {
            client.obliterateRange(
                0,
                client.getLength(),
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText({
                mergeTree: client.mergeTree,
                pos: 0,
                refSeq,
                clientId: remoteClientId + 1,
                seq: refSeq + 2,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });
            assert.equal(client.getText(), "");
        });
        it("removes text for insert then obliterate", () => {
            insertText({
                mergeTree: client.mergeTree,
                pos: 0,
                refSeq,
                clientId: remoteClientId + 1,
                seq: refSeq + 1,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });
            client.obliterateRange(
                0,
                "hello world".length,
                refSeq,
                remoteClientId,
                refSeq + 2,
                false,
                undefined as any,
            );
            assert.equal(client.getText(), "");
        });
    });

    describe("endpoint behavior", () => {
        it("does not expand to include text inserted at start", () => {
            client.obliterateRange(
                5,
                client.getLength(),
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText({
                mergeTree: client.mergeTree,
                pos: 5,
                refSeq,
                clientId: remoteClientId + 1,
                seq: refSeq + 2,
                text: " world",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });
            assert.equal(client.getText(), "hello world");
        });
        it("does not expand to include text inserted at end", () => {
            client.obliterateRange(
                0,
                5,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText({
                mergeTree: client.mergeTree,
                pos: 5,
                refSeq,
                clientId: remoteClientId + 1,
                seq: refSeq + 2,
                text: "hello",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });
            assert.equal(client.getText(), "hello world");
        });
    });

    describe("local obliterate with concurrent inserts", () => {
        it("removes range when pending local obliterate op", () => {
            client.obliterateRange(
                0,
                "hello world".length,
                refSeq,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any,
            );
            insertText({
                mergeTree: client.mergeTree,
                pos: 0,
                refSeq,
                clientId: remoteClientId,
                seq: refSeq + 2,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });
            assert.equal(client.getText(), "");
        });
    });
});
