/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
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
                    assert.strictEqual(evented, false, "Double event");
                    evented = true;
                    assert.strictEqual(
                        sequenceNumber,
                        proposalSequenceNumber,
                        "Unexpected proposal sequenceNumber",
                    );
                    assert.strictEqual(
                        key,
                        proposalKey,
                        "Unexpected proposal key",
                    );
                    assert.strictEqual(
                        value,
                        proposalValue,
                        "Unexpected proposal value",
                    );
                    assert.strictEqual(
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
                    assert.strictEqual(acceptanceState, "just right", ".propose() promise resolved at wrong time");
                });

            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 1");
            // Client sequence number will be 1 for this first proposal.
            // The info must match the proposal we sent above.
            quorum.addProposal(proposalKey, proposalValue, proposalSequenceNumber, true, 1);
            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 2");

            // This message does nothing since the msn is higher than the sequence number of the proposal.
            const immediateNoOp1 = quorum.updateMinimumSequenceNumber(tooEarlyMessage);
            assert.strictEqual(immediateNoOp1, false, "Should not no-op if no proposal was completed");
            assert.strictEqual(evented, false, "Should not have evented yet 1");
            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 3");

            // Wait to see if the proposal promise resolved.
            await Promise.resolve().then(() => {});

            assert.strictEqual(evented, false, "Should not have evented yet 2");
            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 4");

            acceptanceState = "just right";

            // This message accepts the proposal since the msn is higher than the sequence number of the proposal.
            const immediateNoOp2 = quorum.updateMinimumSequenceNumber(justRightMessage);
            assert.strictEqual(immediateNoOp2, true, "Should no-op if proposal was completed");
            assert.strictEqual(evented, true, "Should have evented");
            assert.strictEqual(quorum.get(proposalKey), proposalValue, "Should have the proposal value");

            // Wait to see if the proposal promise resolved.
            await Promise.resolve().then(() => {});

            // Acceptance should have happened before the above await resolves.
            acceptanceState = "too late";

            assert(resolved, ".propose() promise should have resolved");

            await assert.doesNotReject(proposalP);
        });

        it("Remote proposal", async () => {
            let evented = false;

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
                    assert.strictEqual(evented, false, "Double event");
                    evented = true;
                    assert.strictEqual(
                        sequenceNumber,
                        proposalSequenceNumber,
                        "Unexpected proposal sequenceNumber",
                    );
                    assert.strictEqual(
                        key,
                        proposalKey,
                        "Unexpected proposal key",
                    );
                    assert.strictEqual(
                        value,
                        proposalValue,
                        "Unexpected proposal value",
                    );
                    assert.strictEqual(
                        approvalSequenceNumber,
                        justRightMessage.sequenceNumber,
                        "Approved on wrong sequence number",
                    );
                },
            );

            // Client sequence number shouldn't matter for remote proposals.
            quorum.addProposal(proposalKey, proposalValue, proposalSequenceNumber, false, -5);

            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 1");

            // This message does nothing since the msn is higher than the sequence number of the proposal.
            const immediateNoOp1 = quorum.updateMinimumSequenceNumber(tooEarlyMessage);
            assert.strictEqual(immediateNoOp1, false, "Should not no-op if no proposal was completed");
            assert.strictEqual(evented, false, "Should not have evented yet 1");
            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 2");

            // Wait to see if any async stuff is waiting (shouldn't be).
            await Promise.resolve().then(() => {});

            assert.strictEqual(evented, false, "Should not have evented yet 2");
            assert.strictEqual(quorum.get(proposalKey), undefined, "Should not have the proposal value yet 3");

            // This message accepts the proposal since the msn is higher than the sequence number of the proposal.
            const immediateNoOp2 = quorum.updateMinimumSequenceNumber(justRightMessage);
            assert.strictEqual(immediateNoOp2, true, "Should no-op if proposal was completed");
            assert.strictEqual(evented, true, "Should have evented");
            assert.strictEqual(quorum.get(proposalKey), proposalValue, "Should have the proposal value");

            // Wait to see if any async stuff is waiting (shouldn't be).
            await Promise.resolve().then(() => {});
        });
    });

    describe("Members", () => {
        it("Add/remove members", () => {
            // Casting details because the contents don't really matter for this test.
            const client1Info = {
                clientId: "client1",
                details: "details1" as any as ISequencedClient,
            };
            const client2Info = {
                clientId: "client2",
                details: "details2" as any as ISequencedClient,
            }
            const unexpected = {
                clientId: "unexpectedId",
                details: "unexpectedDetails" as any as ISequencedClient,
            }
            let expectedAdd = unexpected;
            let expectedRemove = unexpected;
            let addCount = 0;
            let removeCount = 0;
            quorum.on("addMember", (clientId: string, details: ISequencedClient) => {
                assert.strictEqual(clientId, expectedAdd.clientId, "Unexpected client id added");
                assert.strictEqual(details, expectedAdd.details, "Unexpected client details added");
                addCount++;
            });
            quorum.on("removeMember", (clientId: string) => {
                assert.strictEqual(clientId, expectedRemove.clientId);
                removeCount++;
            });

            assert.strictEqual(quorum.getMembers().size, 0, "Should have no members to start");

            expectedAdd = client1Info;
            quorum.addMember(client1Info.clientId, client1Info.details);
            assert.strictEqual(addCount, 1, "Failed to event for add");
            assert.strictEqual(quorum.getMembers().size, 1, "Should have 1 member after add");
            assert.strictEqual(quorum.getMember(client1Info.clientId), client1Info.details, "Expecting client 1");
            assert.strictEqual(quorum.getMember(client2Info.clientId), undefined, "Not expecting client 2");

            expectedAdd = client2Info;
            quorum.addMember(client2Info.clientId, client2Info.details);
            assert.strictEqual(addCount, 2, "Failed to event for add");
            assert.strictEqual(quorum.getMembers().size, 2, "Should have 2 members after second add");
            assert.strictEqual(quorum.getMember(client1Info.clientId), client1Info.details, "Expecting client 1");
            assert.strictEqual(quorum.getMember(client2Info.clientId), client2Info.details, "Expecting client 2");

            expectedAdd = unexpected;
            expectedRemove = client1Info;
            quorum.removeMember(client1Info.clientId);
            assert.strictEqual(removeCount, 1, "Failed to event for remove");
            assert.strictEqual(quorum.getMembers().size, 1, "Should have 1 member after remove");
            assert.strictEqual(quorum.getMember(client1Info.clientId), undefined, "Not expecting client 1");
            assert.strictEqual(quorum.getMember(client2Info.clientId), client2Info.details, "Expecting client 2");
        });
    });
});
