/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "../ops";
import { PartialSequenceLengths } from "../partialLengths";
import { TestClient } from "./testClient";
import { insertText, validatePartialLengths } from "./testUtils";

describe("obliterate partial lengths", () => {
    let client: TestClient;
    let refSeq: number;
    const localClientId = 17;
    const remoteClientId = 18;

    beforeEach(() => {
        PartialSequenceLengths.options.verify = true;
        client = new TestClient();
        client.startOrUpdateCollaboration("local");
        for (const char of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), char),
                    client.getCurrentSeq() + 1,
                ),
            );
        }
        assert.equal(client.getText(), "hello world");
        refSeq = client.getCurrentSeq();
    });

    afterEach(() => {
        PartialSequenceLengths.options.verify = false;
    });

    it("removes text", () => {
        assert.equal(client.getText(), "hello world");
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

        validatePartialLengths(localClientId, client.mergeTree, [
            { seq: refSeq, len: "hello world".length },
            { seq: refSeq + 1, len: 0 },
        ], 0);
        validatePartialLengths(remoteClientId, client.mergeTree, [
            { seq: refSeq, len: "hello world".length },
            { seq: refSeq + 1, len: 0 },
        ]);
    });

    describe("overlapping remove+obliterate", () => {
        it("passes for local remove and local obliterate", () => {
            client.removeRangeLocal(
                0,
                "hello ".length,
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
            ], refSeq);
            validatePartialLengths(remoteClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
            ]);
        });

        it("passes for local remove and remote obliterate", () => {
            client.removeRangeLocal(
                0,
                "hello ".length,
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
            ]);
            validatePartialLengths(remoteClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
            ], 0);
        });

        it("passes for remote remove and local obliterate", () => {
            client.removeRangeRemote(
                0,
                "hello ".length,
                refSeq + 1,
                refSeq,
                client.getLongClientId(remoteClientId),
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                localClientId,
                refSeq + 2,
                false,
                undefined as any,
            );

            validatePartialLengths(remoteClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "hello world".length },
                { seq: refSeq + 2, len: "world".length },
            ]);
            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "hello world".length },
                { seq: refSeq + 2, len: "world".length },
            ], 0);
        });

        it("passes for remote remove and remote obliterate", () => {
            client.removeRangeRemote(
                0,
                "hello ".length,
                refSeq + 1,
                refSeq,
                client.getLongClientId(remoteClientId),
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                remoteClientId + 1,
                refSeq + 2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "hello world".length },
                { seq: refSeq + 2, len: "world".length },
            ]);
            validatePartialLengths(remoteClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "hello world".length },
                { seq: refSeq + 2, len: "world".length },
            ], 0);
            validatePartialLengths(remoteClientId + 1, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "hello world".length },
                { seq: refSeq + 2, len: "world".length },
            ], 0);
        });
    });

    describe("overlapping obliterate+obliterate", () => {
        it("passes for local obliterate and remote obliterate", () => {
            client.removeRangeLocal(
                0,
                "hello ".length,
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
            ]);
        });

        it("passes for remote obliterate and local obliterate", () => {
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            client.obliterateRange(
                0,
                "hello ".length,
                refSeq,
                localClientId,
                refSeq + 2,
                false,
                undefined as any,
            );

            validatePartialLengths(remoteClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
                { seq: refSeq + 2, len: "world".length },
            ], refSeq + 2);
            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "world".length },
                { seq: refSeq + 2, len: "world".length },
            ], refSeq + 2);
        });
    });

    describe.skip("obliterate with concurrent inserts", () => {
        it("obliterates when concurrent insert in middle of string", () => {
            client.obliterateRange(
                0,
                client.getLength(),
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText(
                client.mergeTree,
                "hello".length,
                refSeq,
                remoteClientId,
                refSeq + 2,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );
            assert.equal(client.getText(), "");

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "".length },
                { seq: refSeq + 2, len: "".length },
            ]);
        });

        it("obliterate does not affect concurrent insert at start of string", () => {
            client.obliterateRange(
                0,
                client.getLength(),
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText(
                client.mergeTree,
                0,
                refSeq,
                remoteClientId,
                refSeq + 2,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );
            assert.equal(client.getText(), "");

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "".length },
                { seq: refSeq + 2, len: "more ".length },
            ]);
        });

        it("obliterate does not affect concurrent insert at end of string", () => {
            client.obliterateRange(
                0,
                client.getLength(),
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            insertText(
                client.mergeTree,
                "hello world".length,
                refSeq,
                remoteClientId,
                refSeq + 2,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );
            assert.equal(client.getText(), "");

            validatePartialLengths(localClientId, client.mergeTree, [
                { seq: refSeq, len: "hello world".length },
                { seq: refSeq + 1, len: "".length },
                { seq: refSeq + 2, len: "more ".length },
            ]);
        });
    });
});
