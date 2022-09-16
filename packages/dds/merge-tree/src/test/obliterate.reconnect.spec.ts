/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeDeltaOp } from "../ops";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

type ClientName = "A" | "B" | "C" | "D";

class ReconnectTestHelper {
    A = new TestClient();
    B = new TestClient();
    C = new TestClient();
    D = new TestClient();

    get allClients() {
        return [this.A, this.B, this.C, this.D];
    }

    idxFromName(name: ClientName): number {
        return name.charCodeAt(0) - "A".charCodeAt(0);
    }

    logger = new TestClientLogger(this.allClients);

    ops: ISequencedDocumentMessage[] = [];
    perClientOps: ISequencedDocumentMessage[][] = this.allClients.map(() => []);

    seq: number = 0;

    constructor() {
        this.A.startOrUpdateCollaboration("A");
        this.B.startOrUpdateCollaboration("B");
        this.C.startOrUpdateCollaboration("C");
        this.D.startOrUpdateCollaboration("D");
    }

    public insertText(clientName: ClientName, pos: number, text: string): void {
        const client = this[clientName];
        this.ops.push(client.makeOpMessage(client.insertTextLocal(pos, text), ++this.seq));
    }

    public removeRange(clientName: ClientName, start: number, end: number): void {
        const client = this[clientName];
        this.ops.push(client.makeOpMessage(client.removeRangeLocal(start, end), ++this.seq));
    }

    public obliterateRange(clientName: ClientName, start: number, end: number): void {
        const client = this[clientName];
        this.ops.push(client.makeOpMessage(client.obliterateRangeLocal(start, end), ++this.seq));
    }

    public disconnect(clientNames: ClientName[]): void {
        const clientIdxs = clientNames.map(this.idxFromName);
        this.ops.splice(0).forEach((op) => this.allClients.forEach(
            (c, i) => clientIdxs.includes(i)
                ? this.perClientOps[i].push(op)
                : c.applyMsg(op)));
    }

    public processAllOps(): void {
        this.ops.splice(0).forEach((op) => this.allClients.forEach((c) => c.applyMsg(op)));
    }

    public reconnect(clientNames: ClientName[]): void {
        const clientIdxs = clientNames.map(this.idxFromName);
        this.perClientOps.forEach(
            (clientOps, i) => {
                if (clientIdxs.includes(i)) {
                    clientOps.splice(0).forEach((op) => this.allClients[i].applyMsg(op));
                }
            },
        );
    }

    public submitDisconnectedOp(clientName: ClientName, op: IMergeTreeDeltaOp): void {
        const client = this[clientName];
        const pendingSegmentGroups = client.peekPendingSegmentGroups();
        assert(pendingSegmentGroups);
        this.ops.push(
            client.makeOpMessage(client.regeneratePendingOp(op, pendingSegmentGroups), ++this.seq),
        );
    }
}

describe("obliterate", () => {
    it("obliterate does not expand during rebase", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.removeRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.C.obliterateRangeLocal(0, 1);
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.A.getText(), "D");

        helper.logger.validate();
    });

    it.skip("deletes reconnected insert into obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.C.insertTextLocal(2, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.A.getText(), "D");

        helper.logger.validate();
    });

    it("does not delete reconnected insert at start of obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.C.insertTextLocal(0, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.A.getText(), "aaaD");

        helper.logger.validate();
    });

    it("does not delete reconnected insert at end of obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.C.insertTextLocal(3, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.A.getText(), "aaaD");

        helper.logger.validate();
    });
});
