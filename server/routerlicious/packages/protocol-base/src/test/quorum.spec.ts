/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { strict as assert } from "assert";
import { Quorum } from "../quorum";

describe("Quorum", () => {
    let quorum: Quorum;

    beforeEach(() => {
        let clientSequenceNumber = 0;
        quorum = new Quorum(
            [],
            [],
            [],
            (key, value) => ++clientSequenceNumber,
        );
    });

    describe("Proposal", () => {
        it("Local proposal", async () => {
            let resolved = false;
            let evented = false;
            let acceptanceState = "too early";

            const proposalKey = "hello";
            const proposalValue = "world";
            const proposalSequenceNumber = 53;
            const tooEarlyMessage = {
                minimumSequenceNumber: 37,
                sequenceNumber: 73,
            } as ISequencedDocumentMessage;
            const justRightMessage = {
                minimumSequenceNumber: 64,
                sequenceNumber: 79,
            } as ISequencedDocumentMessage;

            // Observe eventing.  We expect a single event, with the correct values, to fire at the right time.
            quorum.on(
                "approveProposal",
                (sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => {
                    assert.equal(evented, false, "Double event");
                    evented = true;
                    assert.equal(
                        sequenceNumber,
                        proposalSequenceNumber,
                        "Unexpected proposal sequenceNumber",
                    );
                    assert.equal(
                        key,
                        proposalKey,
                        "Unexpected proposal key",
                    );
                    assert.equal(
                        value,
                        proposalValue,
                        "Unexpected proposal value",
                    );
                    assert.equal(
                        approvalSequenceNumber,
                        justRightMessage.sequenceNumber,
                        "Approved on wrong sequence number",
                    );
                },
            );

            // Proposal generates a promise that will resolve once the proposal is accepted
            // This happens by advancing the msn past the sequence number of the proposal.
            const proposalP = quorum.propose(proposalKey, proposalValue)
                .then(() => {
                    resolved = true;
                    assert.equal(acceptanceState, "just right", ".propose() promise resolved at wrong time");
                });

            // Client sequence number will be 1 for this first proposal.
            // The info must match the proposal we sent above.
            quorum.addProposal(proposalKey, proposalValue, proposalSequenceNumber, true, 1);

            // This message does nothing since the msn is higher than the sequence number of the proposal.
            const immediateNoOp1 = quorum.updateMinimumSequenceNumber(tooEarlyMessage);
            assert.equal(immediateNoOp1, false, "Should not no-op if no proposal was completed");
            assert.equal(evented, false, "Should not have evented yet 1");

            // Wait to see if the proposal promise resolved.
            await Promise.resolve().then(() => {});

            assert.equal(evented, false, "Should not have evented yet 2");

            acceptanceState = "just right";
            
            // Create a fake message that would update the msn.
            // This message accepts the proposal since the msn is higher than the sequence number of the proposal.
            const immediateNoOp2 = quorum.updateMinimumSequenceNumber(justRightMessage);
            assert.equal(immediateNoOp2, true, "Should no-op if proposal was completed");
            assert.equal(evented, true, "Should have evented");

            // Wait to see if the proposal promise resolved.
            await Promise.resolve().then(() => {});

            // Acceptance should have happened before the above await resolves.
            acceptanceState = "too late";

            assert(resolved, ".propose() promise should have resolved");

            await assert.doesNotReject(proposalP);
        });
    });

});
