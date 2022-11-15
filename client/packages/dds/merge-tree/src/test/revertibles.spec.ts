/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    appendToMergeTreeDeltaRevertibles,
    MergeTreeDeltaRevertible,
    revertMergeTreeDeltaRevertibles,
} from "../revertibles";
import { createRevertDriver } from "./testClient";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

describe("MergeTree.Revertibles", () => {
    it("revert insert", () => {
        const clients = createClientsAtInitialState(
            { initialState: "123", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B");
        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };
        ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(0, "BB"), ++seq));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "BB123" });

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "123" });
    });

    it("revert remove", () => {
        const clients = createClientsAtInitialState(
            { initialState: "123", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B");
        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "23" });

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "123" });
    });

    it("revert annotate", () => {
        const clients = createClientsAtInitialState(
            { initialState: "123", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B");
        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };
        ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 1, { test: 1 }, undefined), ++seq));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "123" });

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate({ baseText: "123" });
    });

    it("Remove All Original Text and Insert then Revert", () => {
        const clients = createClientsAtInitialState(
            { initialState: "1-2--", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B", "C");

        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(0, "BB"), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(2, 3), ++seq));

        clients.B.mergeTreeDeltaCallback = old;

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        logger.validate({ baseText: "12" });
    });

    it("Re-Insert at position 0 in empty string", () => {
        const clients = createClientsAtInitialState(
            { initialState: "BBC-", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B", "C");

        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };

        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(2, 3), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(1, "BB"), ++seq));

        clients.B.mergeTreeDeltaCallback = old;

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        logger.validate({ baseText: "BBC" });
    });

    it("Revert remove to empty with annotate", () => {
        const clients = createClientsAtInitialState(
            { initialState: "1-23--", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B", "C");

        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
             appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
        };

        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 2), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 1, { test: 1 }, undefined), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));

        clients.B.mergeTreeDeltaCallback = old;

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

        logger.validate({ baseText: "123" });
    });

    it("Revert Local annotate and remove with intersecting remote annotate", () => {
        const clients = createClientsAtInitialState(
            { initialState: "1234-----", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B", "C");

        const logger = new TestClientLogger(clients.all);
        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];

        const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
        // the test logger uses these callbacks, so preserve it
        const old = clients.B.mergeTreeDeltaCallback;
        const clientBDriver = createRevertDriver(clients.B);
        clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));
        clients.B.mergeTreeDeltaCallback = (op, delta) => {
            old?.(op, delta);
            if (op.sequencedMessage === undefined) {
                 appendToMergeTreeDeltaRevertibles(clientBDriver, delta, clientB_Revertibles);
            }
        };
        ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 4, { test: "B" }, undefined), ++seq));
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 2), ++seq));
        clients.B.mergeTreeDeltaCallback = old;

        ops.push(clients.C.makeOpMessage(clients.C.annotateRangeLocal(3, 4, { test: "C" }, undefined), ++seq));

        ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        logger.validate();

        try {
            revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));
            ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
        } catch (e) {
            throw logger.addLogsToError(e);
        }

        logger.validate();
    });
});
