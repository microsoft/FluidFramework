/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
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

    it("does not delete reconnected insert into obliterate range if insert is rebased", () => {
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

        assert.equal(helper.clients.A.getText(), "aaaD");
        assert.equal(helper.clients.C.getText(), "aaaD");

        helper.logger.validate();
    });

    it("does deletes reconnected insert into obliterate range when entire string deleted if rebased", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 4);
        helper.disconnect(["C"]);
        const cOp = helper.clients.C.insertTextLocal(2, "aaa");
        assert(cOp);
        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "aaa");
        assert.equal(helper.clients.C.getText(), "aaa");

        helper.logger.validate();
    });

    it.skip("...", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "ABCDE");
        helper.processAllOps();
        helper.removeRange("A", 0, 2);
        helper.insertText("A", 2, "X");

        helper.disconnect(["C"]);

        const cOp1 = helper.clients.C.insertTextLocal(1, "123");
        assert(cOp1);
        const cOp2 = helper.clients.C.removeRangeLocal(2, 3);
        assert(cOp2);
        const cOp3 = helper.clients.C.insertTextLocal(1, "Z");
        assert(cOp3);

        helper.reconnect(["C"]);
        helper.submitDisconnectedOp("C", cOp1);
        helper.submitDisconnectedOp("C", cOp2);
        helper.submitDisconnectedOp("C", cOp3);
        helper.processAllOps();

        helper.logger.validate();
    });

    it("length of children does not differ from parent when overlapping remove+obliterate", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "1fY9yxuL");
        helper.processAllOps();
        helper.removeRange("C", 0, 3);
        helper.insertText("C", 1, "yxh4AK");

        helper.removeRange("A", 5, 7);
        helper.insertText("A", 0, "eEyya");
        helper.obliterateRange("A", 2, 11);
        helper.removeRange("A", 1, 2);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "e");

        helper.logger.validate();
    });

    it("does not delete reconnected insert at start of obliterate range if rebased", () => {
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
        assert.equal(helper.clients.C.getText(), "aaaD");

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

    it("deletes concurrent insert that occurs after obliterate", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.obliterateRange("B", 0, 4);
        helper.insertText("C", 2, "X");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    });

    it("deletes concurrent insert that occurs before obliterate", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.processAllOps();
        helper.insertText("C", 2, "X");
        helper.obliterateRange("B", 0, 4);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    });

    it("does not delete unacked segment at start of string", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("C", 0, "ABC");
        helper.obliterateRange("C", 2, 3);
        helper.insertText("B", 0, "X");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "XAB");
        assert.equal(helper.clients.B.getText(), "XAB");
        assert.equal(helper.clients.C.getText(), "XAB");

        helper.logger.validate();
    });

    it("throws when local obliterate has range end outside length of local string", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "A");
        helper.insertText("C", 0, "B");

        try {
            helper.obliterateRange("C", 0, 2);
            assert.fail("should not be possible to obliterate outside local range");
        } catch (e) {
            assert(e instanceof LoggingError);
            assert.equal(e.message, "RangeOutOfBounds");
        }
    });

    describe("does not delete segment inserted between two different local obliterate ranges", () => {
        it("does not delete when obliterate immediately after insert", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "A");
            helper.obliterateRange("C", 0, 1);
            helper.insertText("B", 0, "W");
            helper.insertText("C", 0, "D");
            helper.obliterateRange("C", 0, 1);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "W");
            assert.equal(helper.clients.B.getText(), "W");
            assert.equal(helper.clients.C.getText(), "W");

            helper.logger.validate();
        });

        it("does not delete remote insert when between local insert+obliterate", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "A");
            helper.insertText("B", 0, "X");
            helper.obliterateRange("C", 0, 1);
            helper.insertText("C", 0, "B");
            helper.obliterateRange("C", 0, 1);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "X");
            assert.equal(helper.clients.B.getText(), "X");
            assert.equal(helper.clients.C.getText(), "X");

            helper.logger.validate();
        });

        it("does not delete remote insert when between local insert+obliterate", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "A");
            helper.obliterateRange("C", 0, 1);
            helper.insertText("B", 0, "B");
            helper.insertText("C", 0, "X");
            helper.obliterateRange("B", 0, 1);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "X");
            assert.equal(helper.clients.B.getText(), "X");
            assert.equal(helper.clients.C.getText(), "X");

            helper.logger.validate();
        });

        it("does not delete remote insert when in middle of segment", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "ABC");
            helper.obliterateRange("C", 2, 3);
            helper.obliterateRange("C", 0, 1);
            helper.insertText("B", 0, "X");
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "XB");
            assert.equal(helper.clients.B.getText(), "XB");
            assert.equal(helper.clients.C.getText(), "XB");

            helper.logger.validate();
        });
    });

    it("deletes segment inserted into locally obliterated segment", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("C", 0, "A");
        helper.insertText("B", 0, "X");
        helper.insertText("C", 0, "B");
        helper.obliterateRange("C", 0, 2);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.B.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    });

    describe("correctly updates partial lengths", () => {
        it("updates lengths after obliterated insertion", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "A");
            helper.insertText("B", 0, "X");
            helper.insertText("C", 0, "N");
            helper.obliterateRange("C", 0, 2);
            helper.insertText("B", 1, "B");
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "");
            assert.equal(helper.clients.B.getText(), "");
            assert.equal(helper.clients.C.getText(), "");

            assert.equal(helper.clients.A.getLength(), 0);
            assert.equal(helper.clients.B.getLength(), 0);
            assert.equal(helper.clients.C.getLength(), 0);

            helper.logger.validate();
        });

        it("updates lengths when insertion causes tree to split", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("A", 0, "0");
            helper.insertText("C", 0, "123");
            helper.insertText("B", 0, "BB");
            helper.insertText("C", 0, "GGG");
            helper.obliterateRange("C", 2, 5);
            helper.insertText("B", 1, "A");
            helper.processAllOps();

            assert.equal(helper.clients.A.getText().length, helper.clients.A.getLength());
            assert.equal(helper.clients.B.getText().length, helper.clients.B.getLength());
            assert.equal(helper.clients.C.getText().length, helper.clients.C.getLength());

            assert.equal(helper.clients.A.getText(), "GG30");

            helper.logger.validate();
        });

        it("length of node split by insertion does not count remotely obliterated segments", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("A", 0, "1");
            helper.insertText("A", 0, "2");
            helper.insertText("C", 0, "XXXX");
            helper.insertText("B", 0, "ABC");
            helper.insertText("C", 0, "GGG");
            helper.obliterateRange("C", 2, 6);
            helper.insertText("C", 1, "D");
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "GDGX21");
            assert.equal(helper.clients.C.getText(), "GDGX21");

            helper.logger.validate();
        });

        it("length of node split by obliterate does not count remotely obliterated segments", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("A", 0, "1");
            helper.insertText("A", 0, "2");
            helper.insertText("C", 0, "XXXX");
            helper.insertText("B", 0, "A");
            helper.insertText("C", 0, "GGG");
            helper.obliterateRange("C", 2, 6);
            helper.insertText("C", 1, "C");
            helper.insertText("B", 1, "D");
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "GCGX21");
            assert.equal(helper.clients.B.getText(), "GCGX21");

            helper.logger.validate();
        });

        it("counts remotely but not concurrently inserted segments for length when tree is split", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("B", 0, "123");
            helper.insertText("C", 0, "e");
            helper.insertText("C", 0, "d");
            helper.insertText("C", 0, "c");
            helper.insertText("C", 0, "b");
            helper.insertText("C", 0, "a");
            helper.processAllOps();
            helper.obliterateRange("B", 0, 2);
            helper.removeRange("B", 4, 5);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "cde13");
            assert.equal(helper.clients.C.getText(), "cde13");

            helper.logger.validate();
        });
    });

    it("does obliterate X for all clients", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "DE");
        helper.obliterateRange("B", 0, 1);
        helper.insertText("A", 0, "X");
        helper.insertText("B", 0, "ABC");
        helper.obliterateRange("B", 2, 4);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "AB");
        assert.equal(helper.clients.C.getText(), "AB");

        helper.logger.validate();
    });

    it("does not include remote but unacked segments in partial len calculation", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "X");
        helper.insertText("C", 0, "123");
        helper.insertText("C", 0, "4567");
        helper.insertText("B", 0, "89");
        helper.processAllOps();
        helper.obliterateRange("C", 1, 7);
        helper.insertText("A", 3, "w");
        helper.insertText("C", 3, "Y");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "823YX");
        assert.equal(helper.clients.B.getText(), "823YX");

        helper.logger.validate();
    });

    describe("overlapping obliterate with other remove/obliterate", () => {
        it("correctly accounts for overlapping obliterate", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("B", 0, "AB");
            helper.processAllOps();
            helper.obliterateRange("C", 0, 1);
            helper.obliterateRange("B", 0, 1);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "B");
            assert.equal(helper.clients.B.getText(), "B");
            assert.equal(helper.clients.C.getText(), "B");

            helper.logger.validate();
        });

        it("correctly accounts for overlapping obliterate and remove", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("B", 0, "AB");
            helper.processAllOps();
            helper.removeRange("C", 0, 1);
            helper.obliterateRange("B", 0, 1);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "B");
            assert.equal(helper.clients.B.getText(), "B");
            assert.equal(helper.clients.C.getText(), "B");

            helper.logger.validate();
        });

        it("clones movedClientIds array during insert", () => {
            const helper = new ReconnectTestHelper();

            // the bug found here:
            // the X was skipped over by client `A` because it had already been
            // deleted, so its length at refSeq was 0
            //
            // this was due to the movedClientIds array not being properly cloned
            // when marking obliterated during insert

            helper.insertText("C", 0, "ABCD");
            helper.processAllOps();
            helper.insertText("B", 2, "X");
            helper.obliterateRange("A", 1, 3);
            helper.obliterateRange("B", 1, 4);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "AD");
            assert.equal(helper.clients.B.getText(), "AD");
            assert.equal(helper.clients.C.getText(), "AD");

            helper.logger.validate();
        });

        it("client partial lens consider overlapping obliterates", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("A", 0, "123");
            helper.insertText("A", 0, "ABCDEF");
            helper.processAllOps();
            helper.obliterateRange("B", 2, 3);
            helper.obliterateRange("C", 1, 4);
            helper.obliterateRange("C", 4, 5);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "AEF13");
            assert.equal(helper.clients.B.getText(), "AEF13");
            assert.equal(helper.clients.C.getText(), "AEF13");

            helper.logger.validate();
        });


        it("client partial lens consider overlapping obliterates", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("C", 0, "X");
            helper.insertText("C", 0, "ABCDEFG");
            helper.processAllOps();
            helper.obliterateRange("B", 2, 3);
            helper.obliterateRange("C", 1, 4);
            helper.obliterateRange("C", 2, 3);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "AEGX");
            assert.equal(helper.clients.C.getText(), "AEGX");

            helper.logger.validate();
        });

        it("tracks obliterate refSeq when acking op for partial len calculation", () => {
            const helper = new ReconnectTestHelper();

            helper.insertText("A", 0, "12");
            helper.insertText("B", 0, "ABCDEFGHI");
            helper.insertText("A", 0, "345");
            helper.obliterateRange("A", 0, 4);
            helper.obliterateRange("B", 2, 4);
            helper.insertText("A", 0, "6");
            helper.obliterateRange("B", 3, 5);
            helper.processAllOps();

            assert.equal(helper.clients.A.getText(), "62");
            assert.equal(helper.clients.B.getText(), "62");

            helper.logger.validate();
        });
    });

    it("does not have negative len when segment obliterated before insert", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.insertText("A", 0, "C");
        helper.insertText("A", 0, "D");
        helper.insertText("A", 0, "1234567");
        helper.processAllOps();
        helper.obliterateRange("A", 2, 7);
        helper.removeRange("A", 2, 5);
        helper.insertText("C", 3, "X");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "12B");
        assert.equal(helper.clients.B.getText(), "12B");
        assert.equal(helper.clients.C.getText(), "12B");

        helper.logger.validate();
    });

    it("does not have negative len when segment obliterated before insert", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "123");
        helper.insertText("C", 0, "ABCDE");
        helper.removeRange("B", 1, 2);
        helper.processAllOps();
        helper.obliterateRange("C", 0, 2);
        helper.obliterateRange("C", 0, 2);
        helper.insertText("B", 1, "XX");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "E13");
        assert.equal(helper.clients.B.getText(), "E13");
        assert.equal(helper.clients.C.getText(), "E13");

        helper.logger.validate();
    });

    it("deletes segments between two obliterates with different seq", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "A");
        helper.insertText("C", 0, "B");
        helper.insertText("C", 0, "C");
        helper.insertText("C", 0, "D");
        helper.insertText("B", 0, "1234567");
        helper.obliterateRange("B", 4, 5);
        helper.insertText("A", 0, "8");
        helper.insertText("A", 0, "90");
        helper.processAllOps();
        helper.removeRange("C", 1, 9);
        helper.insertText("A", 1, "EFG");
        helper.obliterateRange("A", 1, 11);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "9DCBA");

        helper.logger.validate();
    });

    it("deletes inserted segment when obliterate of different seq in-between", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.insertText("B", 0, "E");
        helper.obliterateRange("A", 0, 1);
        helper.insertText("A", 1, "12");
        helper.insertText("A", 0, "CD");
        helper.obliterateRange("A", 1, 4);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "C2");
        assert.equal(helper.clients.B.getText(), "C2");
        assert.equal(helper.clients.C.getText(), "C2");

        helper.logger.validate();
    });

    it("deletes inserted segment when obliterate of different seq in-between", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "ABC");
        helper.obliterateRange("A", 1, 2);
        helper.processAllOps();
        helper.insertText("A", 1, "D");
        helper.obliterateRange("C", 0, 2);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.B.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    });

    it("deletes inserted segment when obliterate of different seq in-between", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "ABC");
        helper.obliterateRange("A", 1, 2);
        helper.processAllOps();
        helper.insertText("A", 1, "D");
        helper.obliterateRange("C", 0, 2);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.B.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    });

    it("considers obliterated local segments as remotely obliterate", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.obliterateRange("A", 1, 2);
        helper.insertText("C", 0, "CDE");
        helper.insertText("B", 0, "F");
        helper.insertText("C", 0, "GH");
        helper.obliterateRange("C", 1, 3);
        helper.insertText("B", 1, "I");
        helper.insertText("C", 1, "J");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "GJDEA");
        assert.equal(helper.clients.B.getText(), "GJDEA");

        helper.logger.validate();
    });

    it("traverses hier block in obliterated when len at ref seq is >0 and len at len seq == 0", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.insertText("A", 2, "CD");
        helper.removeRange("A", 1, 3);
        helper.insertText("C", 0, "12345");
        helper.insertText("B", 0, "EFG");
        helper.insertText("B", 1, "HIJKL");
        helper.processAllOps();
        helper.logger.validate();
        helper.obliterateRange("A", 6, 12);
        helper.removeRange("A", 5, 7);
        helper.obliterateRange("C", 7, 9);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), helper.clients.D.getText());
        // assert.equal(helper.clients.B.getText(), "GJDEA");

        helper.logger.validate();
    });

    it("traverses hier block in obliterated when len at ref seq is >0 and len at len seq == 0", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABCD");
        helper.removeRange("B", 0, 1);
        helper.insertText("C", 0, "12");
        helper.insertText("A", 0, "EFGH");
        helper.removeRange("B", 1, 2);
        helper.removeRange("A", 0, 1);
        helper.processAllOps();
        helper.removeRange("A", 1, 5);
        helper.obliterateRange("B", 2, 4);
        helper.insertText("A", 0, "3");
        helper.insertText("A", 0, "4");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "43FBD");
        assert.equal(helper.clients.B.getText(), "43FBD");

        helper.logger.validate();
    });

    it("ignores segments where movedSeq < seq for partial len calculations", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "ABC");
        helper.insertText("A", 0, "DEF");
        helper.removeRange("A", 1, 2);
        helper.insertText("B", 0, "123456");
        helper.obliterateRange("B", 2, 7);
        helper.insertText("A", 1, "Y");
        helper.processAllOps();
        helper.logger.validate();
        helper.insertText("B", 4, "X");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "12BCX");
        assert.equal(helper.clients.B.getText(), "12BCX");
        assert.equal(helper.clients.C.getText(), "12BCX");

        helper.logger.validate();
    });

    it("accounts for overlapping obliterates from same client", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.processAllOps();
        helper.logger.validate();
        helper.obliterateRange("B", 0, 1);
        helper.obliterateRange("B", 0, 1);
        helper.removeRange("A", 0, 1);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.B.getText(), "");
        assert.equal(helper.clients.C.getText(), "");

        helper.logger.validate();
    })

    it("accounts for concurrently obliterated segments from the perspective of the inserting client for partial lengths", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "A");
        helper.insertText("C", 0, "B");
        helper.insertText("C", 0, "C");
        helper.insertText("A", 0, "1234");
        helper.processAllOps();
        helper.obliterateRange("C", 1, 3);
        helper.insertText("A", 2, "D");
        helper.insertText("A", 4, "E");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "1E4CBA");
        assert.equal(helper.clients.B.getText(), "1E4CBA");

        helper.logger.validate();
    })

    it("traverses segments when there is a local obliterate", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("A", 0, "AB");
        helper.obliterateRange("A", 0, 1);
        helper.insertText("C", 0, "12");
        helper.processAllOps();
        helper.logger.validate();
        helper.insertText("C", 2, "C");
        helper.obliterateRange("A", 0, 3);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");

        helper.logger.validate();
    })

    it("...", () => {
        const helper = new ReconnectTestHelper();

        // G-3
        // (G-Q-(3))

        helper.insertText("C", 0, "A");
        helper.insertText("B", 0, "B");
        helper.processAllOps();
        helper.logger.validate();
        helper.obliterateRange("B", 1, 2);
        helper.obliterateRange("A", 0, 2);
        helper.insertText("B", 1, "C");
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "");
        assert.equal(helper.clients.B.getText(), "");
        assert.equal(helper.clients.C.getText(), "");
        assert.equal(helper.clients.D.getText(), "");

        helper.logger.validate();
    })

    it.skip("...", () => {
        const helper = new ReconnectTestHelper();

        helper.insertText("B", 0, "G");
        helper.insertText("B", 1, "PU2qbO");
        helper.insertText("C", 0, "v");
        helper.processAllOps();
        helper.logger.validate();
        helper.removeRange("B", 3, 4);
        helper.obliterateRange("A", 3, 5);
        helper.removeRange("A", 4, 5);
        helper.processAllOps();
        helper.logger.validate();
    })

    it.skip("...", () => {
        const helper = new ReconnectTestHelper();

        // EF-ABCD
        // (1)-2-((E)-F-A)-B-(C)-D

        helper.insertText("C", 0, "ABCD");
        helper.insertText("B", 0, "EF");
        helper.processAllOps();
        helper.logger.validate();
        helper.obliterateRange("B", 0, 3);
        helper.insertText("A", 0, "12");
        helper.removeRange("C", 0, 1);
        helper.obliterateRange("A", 0, 1);
        helper.obliterateRange("B", 1, 2);
        helper.processAllOps();

        assert.equal(helper.clients.A.getText(), "2BD");

        helper.logger.validate();
    })

    it.skip("...", () => {
        const helper = new ReconnectTestHelper();

        // 12345-B-A
        // ((1-C-2)-3)-4-D-5-B-A

        helper.insertText("C", 0, "A");
        helper.insertText("B", 0, "B");
        helper.insertText("A", 0, "12345");
        helper.processAllOps();
        helper.logger.validate();
        helper.obliterateRange("A", 0, 2);
        helper.insertText("C", 1, "C");
        helper.obliterateRange("C", 0, 4);
        helper.insertText("C", 1, "D");
        helper.processAllOps();
        helper.logger.validate();
    })
});
