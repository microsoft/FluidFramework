/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, ITree } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { MockStorage } from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import { TestClient } from ".";
import { IMergeTreeOp } from "../ops";
import { Snapshot } from "../snapshot";

// Reconstitutes a MergeTree client from a snapshot
async function loadSnapshot(tree: ITree) {
    const services = new MockStorage(tree);
    const client2 = new TestClient(undefined);
    const runtime: Partial<IComponentRuntime> = {
        logger: client2.logger,
        clientId: "1",
    };
    const loader = client2.createSnapshotLoader(runtime as IComponentRuntime);
    await loader.initialize(undefined, services);
    return client2;
}

// Wrapper around MergeTree client that provides a convenient SharedString-like API for tests.
class TestString {
    private client = new TestClient();
    private readonly pending: ISequencedDocumentMessage[] = [];
    private seq = 0;
    private minSeq = 0;

    constructor(id: string) {
        this.client.startCollaboration(id);
    }

    public insert(pos: number, text: string, increaseMsn: boolean) {
        this.queue(this.client.insertTextLocal(pos, text, { segment: this.pending.length }), increaseMsn);
    }

    public append(text: string, increaseMsn: boolean) {
        this.insert(this.client.getLength(), text, increaseMsn);
    }

    public removeRange(start: number, end: number, increaseMsn: boolean) {
        this.queue(this.client.removeRangeLocal(start, end), increaseMsn);
    }

    // Ensures the client's text matches the `expected` string and round-trips through a snapshot
    // into a new client.  The current client is then replaced with the loaded client in the hope
    // that it will help detect corruption bugs as further ops are applied.
    public async expect(expected: string) {
        assert.equal(this.client.getText(), expected,
            "MergeTree must contain the expected text prior to applying ops.");

        await this.checkSnapshot();
    }

    // Ensures the MergeTree client's contents successfully roundtrip through a snapshot.
    public async checkSnapshot() {
        this.applyPending();
        const tree = this.getSnapshot();
        const client2 = await loadSnapshot(tree);

        assert.equal(this.client.getText(), client2.getText(),
            "Snapshot must produce a MergeTree with the same text as the original");

        // Also check the length as weak test for non-TextSegments.
        assert.equal(this.client.getLength(), client2.getLength(),
            "Snapshot must produce a MergeTree with the same length as the original");

        // Replace our client with the one loaded by the snapshot.
        this.client = client2;
    }

    public getSnapshot() {
        const snapshot = new Snapshot(this.client.mergeTree, this.client.logger);
        snapshot.extractSync();
        return snapshot.emit([]);
    }

    public getText() { return this.client.getText(); }

    private applyPending() {
        for (const msg of this.pending) {
            this.client.applyMsg(msg);
        }
        this.pending.splice(0, this.pending.length);
    }

    private queue(op: IMergeTreeOp, increaseMsn: boolean) {
        this.pending.push(
            this.client.makeOpMessage(
                op,
                /* seq: */ this.seq + 1,
                /* refSeq: */ this.seq,
                this.client.longClientId,
                /* minSeq: */ this.minSeq = increaseMsn
                    ? this.seq + 1
                    : this.minSeq));
        this.seq++;
    }
}

describe("snapshot", () => {
    let str: TestString;

    beforeEach(() => {
        str = new TestString("0");
    });

    afterEach(async () => {
        await str.checkSnapshot();
    });

    it("excludes un-acked segments", async () => {
        str.append("0", /* increaseMsn: */ false);
        const client2 = await loadSnapshot(str.getSnapshot());

        // Original client has inserted text, but the one loaded from the snapshot does not.
        // This is because the un-ACKed ops will be fetched after the snapshot has loaded.
        assert.equal(str.getText(), "0");
        assert.equal(client2.getText(), "");
    });

    it("includes segments below MSN", async () => {
        str.append("0", /* increaseMsn: */ true);
        await str.expect("0");
    });

    it("includes ACKed segments above the MSN", async () => {
        str.append("0", /* increaseMsn: */ false);
        await str.expect("0");
    });

    it("includes removed segments above the MSN", async () => {
        str.append("0x", /* increaseMsn: */ false);
        str.append("1", /* increaseMsn: */ false);
        str.removeRange(1, 2, /* increaseMsn: */ false);
        await str.expect("01");
    });

    it("can insert segments relative to loaded removed segment", async () => {
        str.append("0x", /* increaseMsn: */ false);
        str.append("2", /* increaseMsn: */ false);
        str.removeRange(1, 2, /* increaseMsn: */ false);
        await str.expect("02");
        str.insert(1, "1", /* increaseMsn: */ false);
        str.append("3", /* increaseMsn: */ false);
        await str.expect("0123");
    });

    it("includes ACKed segments below MSN in body", async () => {
        for (let i = 0; i < Snapshot.sizeOfFirstChunk + 10; i++) {
            str.append(`${i % 10}`, /* increaseMsn: */ true);
        }

        await str.checkSnapshot();
    });

    it("includes ACKed segments above MSN in body", async () => {
        for (let i = 0; i < Snapshot.sizeOfFirstChunk + 10; i++) {
            str.append(`${i % 10}`, /* increaseMsn: */ false);
        }

        await str.checkSnapshot();
    });
});
