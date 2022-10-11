/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeDeltaOp } from "../ops";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

const ClientIds = ["A", "B", "C", "D"] as const;
type ClientName = typeof ClientIds[number];

class ReconnectTestHelper {
    clients = createClientsAtInitialState({ initialState: "" }, ...ClientIds);

    idxFromName(name: ClientName): number {
        return name.charCodeAt(0) - "A".charCodeAt(0);
    }

    logger = new TestClientLogger(this.clients.all);

    ops: ISequencedDocumentMessage[] = [];
    perClientOps: ISequencedDocumentMessage[][] = this.clients.all.map(() => []);

    seq: number = 0;

    public insertText(clientName: ClientName, pos: number, text: string): void {
        const client = this.clients[clientName];
        this.ops.push(client.makeOpMessage(client.insertTextLocal(pos, text), ++this.seq));
    }

    public removeRange(clientName: ClientName, start: number, end: number): void {
        const client = this.clients[clientName];
        this.ops.push(client.makeOpMessage(client.removeRangeLocal(start, end), ++this.seq));
    }

    public obliterateRange(clientName: ClientName, start: number, end: number): void {
        const client = this.clients[clientName];
        this.ops.push(client.makeOpMessage(client.obliterateRangeLocal(start, end), ++this.seq));
    }

    public disconnect(clientNames: ClientName[]): void {
        const clientIdxs = clientNames.map(this.idxFromName);
        this.ops.splice(0).forEach((op) => this.clients.all.forEach(
            (c, i) => clientIdxs.includes(i)
                ? this.perClientOps[i].push(op)
                : c.applyMsg(op)));
    }

    public processAllOps(): void {
        this.ops.splice(0).forEach((op) => this.clients.all.forEach((c) => c.applyMsg(op)));
    }

    public reconnect(clientNames: ClientName[]): void {
        const clientIdxs = clientNames.map(this.idxFromName);
        this.perClientOps.forEach(
            (clientOps, i) => {
                if (clientIdxs.includes(i)) {
                    clientOps.splice(0).forEach((op) => this.clients.all[i].applyMsg(op));
                }
            },
        );
    }

    public submitDisconnectedOp(clientName: ClientName, op: IMergeTreeDeltaOp): void {
        const client = this.clients[clientName];
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
        const cOp = helper.clients.C.obliterateRangeLocal(0, 1);
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "D");

        helper.logger.validate();
    });

    it.skip("deletes reconnected insert into obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.clients.C.insertTextLocal(2, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "D");

        helper.logger.validate();
    });

    it("does not delete reconnected insert at start of obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.clients.C.insertTextLocal(0, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "aaaD");

        helper.logger.validate();
    });

    it("does not delete reconnected insert at end of obliterate range", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 3);
        helper.disconnect(["C"]);
        const cOp = helper.clients.C.insertTextLocal(3, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "aaaD");

        helper.logger.validate();
    });
});
