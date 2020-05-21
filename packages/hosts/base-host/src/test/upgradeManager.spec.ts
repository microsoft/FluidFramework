/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UpgradeManager } from "../utils";

/* eslint-disable @typescript-eslint/consistent-type-assertions */
describe("UpgradeManager", () => {
    it("prevents multiple approved proposals", async () => {
        const clients = 50;
        let seqNum = 0;
        let clientId = 0;
        const opHandler: ProtocolOpHandler = new ProtocolOpHandler(
            "", 0, 0, 1, [], [], [],
            (key, value) => {
                const s = ++seqNum;
                // delay this so we can have multiple proposals before first proposal op
                // otherwise upgrade manager will skip proposing
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                new Promise((resolve) => setTimeout(() => resolve(), 1)).then(() => {
                    opHandler.processMessage({
                        type: "propose",
                        contents: { key, value },
                        sequenceNumber: s,
                        clientSequenceNumber: s,
                    } as ISequencedDocumentMessage, false);
                });
                return s;
            },
            (value) => {
                opHandler.processMessage({
                    type: "reject",
                    contents: value,
                    clientId: `${++clientId}`,
                } as ISequencedDocumentMessage, false);
            },
        );

        const quorum = opHandler.quorum;
        let approvedCount = 0;
        let rejectedCount = 0;
        quorum.on("approveProposal", () => { ++approvedCount; });
        quorum.on("rejectProposal", () => { ++rejectedCount; });
        quorum.setMaxListeners(clients + 1);

        const upMans: UpgradeManager[] = [];
        for (let i = 0; i < clients; ++i) {
            upMans.push(new UpgradeManager(quorum));
        }
        const succeededP = Promise.all(upMans.map(
            async (u) => new Promise<void>((resolve) => u.on("upgradeSucceeded", () => resolve()))));

        // upgrade all
        upMans.map(async (u) => u.upgrade({ package: "fluid is really great", config: {} }));

        // update msn to send approvals and rejections (reject() from upgrade managers will throw after this)
        await new Promise((resolve) => setTimeout(() => resolve(), 1));
        quorum.updateMinimumSequenceNumber({ minimumSequenceNumber: seqNum } as ISequencedDocumentMessage);

        // we expect all upgrade managers to succeed, only one proposal approved, and all others to be rejected
        await succeededP;
        assert.strictEqual(approvedCount, 1);
        assert.strictEqual(rejectedCount, clients - 1);
    });
});
/* eslint-enable @typescript-eslint/consistent-type-assertions */
