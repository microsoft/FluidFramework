/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedClient } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { Quorum } from "../protocol/index.js";

/* eslint-disable @typescript-eslint/consistent-type-assertions */

describe("Quorum", () => {
	let quorum: Quorum;

	beforeEach(() => {
		let clientSequenceNumber = 0;
		quorum = new Quorum([], [], [], (key, value) => ++clientSequenceNumber);
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
				(
					sequenceNumber: number,
					key: string,
					value: unknown,
					approvalSequenceNumber: number,
				) => {
					assert.strictEqual(evented, false, "Double event");
					evented = true;
					assert.strictEqual(
						sequenceNumber,
						proposalSequenceNumber,
						"Unexpected proposal sequenceNumber",
					);
					assert.strictEqual(key, proposalKey, "Unexpected proposal key");
					assert.strictEqual(value, proposalValue, "Unexpected proposal value");
					assert.strictEqual(
						approvalSequenceNumber,
						justRightMessage.sequenceNumber,
						"Approved on wrong sequence number",
					);
				},
			);

			// Proposal generates a promise that will resolve once the proposal is accepted
			// This happens by advancing the msn past the sequence number of the proposal.
			const proposalP = quorum.propose(proposalKey, proposalValue).then(() => {
				resolved = true;
				assert.strictEqual(
					acceptanceState,
					"just right",
					".propose() promise resolved at wrong time",
				);
			});

			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 1",
			);
			// Client sequence number will be 1 for this first proposal.
			// The info must match the proposal we sent above.
			quorum.addProposal(proposalKey, proposalValue, proposalSequenceNumber, true, 1);
			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 2",
			);

			// This message does nothing since the msn is higher than the sequence number of the proposal.
			quorum.updateMinimumSequenceNumber(tooEarlyMessage);
			assert.strictEqual(evented, false, "Should not have evented yet 1");
			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 3",
			);

			// Wait to see if the proposal promise resolved.
			await Promise.resolve().then(() => {});

			assert.strictEqual(evented, false, "Should not have evented yet 2");
			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 4",
			);

			acceptanceState = "just right";

			// This message accepts the proposal since the msn is higher than the sequence number of the proposal.
			quorum.updateMinimumSequenceNumber(justRightMessage);
			assert.strictEqual(evented, true, "Should have evented");
			assert.strictEqual(
				quorum.get(proposalKey),
				proposalValue,
				"Should have the proposal value",
			);

			// Wait to see if the proposal promise resolved.
			await Promise.resolve().then(() => {});
			// Due to the composition of Quorum -> QuorumProposals, we require one more microtask deferral to resolve.
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
				(
					sequenceNumber: number,
					key: string,
					value: unknown,
					approvalSequenceNumber: number,
				) => {
					assert.strictEqual(evented, false, "Double event");
					evented = true;
					assert.strictEqual(
						sequenceNumber,
						proposalSequenceNumber,
						"Unexpected proposal sequenceNumber",
					);
					assert.strictEqual(key, proposalKey, "Unexpected proposal key");
					assert.strictEqual(value, proposalValue, "Unexpected proposal value");
					assert.strictEqual(
						approvalSequenceNumber,
						justRightMessage.sequenceNumber,
						"Approved on wrong sequence number",
					);
				},
			);

			// Client sequence number shouldn't matter for remote proposals.
			quorum.addProposal(proposalKey, proposalValue, proposalSequenceNumber, false, -5);

			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 1",
			);

			// This message does nothing since the msn is higher than the sequence number of the proposal.
			quorum.updateMinimumSequenceNumber(tooEarlyMessage);
			assert.strictEqual(evented, false, "Should not have evented yet 1");
			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 2",
			);

			// Wait to see if any async stuff is waiting (shouldn't be).
			await Promise.resolve().then(() => {});

			assert.strictEqual(evented, false, "Should not have evented yet 2");
			assert.strictEqual(
				quorum.get(proposalKey),
				undefined,
				"Should not have the proposal value yet 3",
			);

			// This message accepts the proposal since the msn is higher than the sequence number of the proposal.
			quorum.updateMinimumSequenceNumber(justRightMessage);
			assert.strictEqual(evented, true, "Should have evented");
			assert.strictEqual(
				quorum.get(proposalKey),
				proposalValue,
				"Should have the proposal value",
			);

			// Wait to see if any async stuff is waiting (shouldn't be).
			await Promise.resolve().then(() => {});
		});

		it("Remote client overwrite", async () => {
			let resolved = false;
			let rejected = false;

			const proposalKey = "hello";
			const localProposalValue = "world";
			const remoteProposalValue = "mars";
			const localProposalSequenceNumber = 53;
			const remoteProposalSequenceNumber = 68;
			const approveLocalProposalMessage = {
				minimumSequenceNumber: 64,
				sequenceNumber: 79,
			} as ISequencedDocumentMessage;
			const approveRemoteProposalMessage = {
				minimumSequenceNumber: 72,
				sequenceNumber: 84,
			} as ISequencedDocumentMessage;

			// This test is going to have a remote proposal overwrite the local proposal before the local proposal
			// is approved.  The promise will still resolve and the value will reflect the local proposal in the
			// window between the approval of the local proposal and the remote proposal.
			const proposalP = quorum
				.propose(proposalKey, localProposalValue)
				.then(() => {
					resolved = true;
				})
				.catch(() => {
					rejected = true;
				});

			quorum.addProposal(
				proposalKey,
				localProposalValue,
				localProposalSequenceNumber,
				true,
				1,
			);
			// Client sequence number shouldn't matter for remote proposals.
			quorum.addProposal(
				proposalKey,
				remoteProposalValue,
				remoteProposalSequenceNumber,
				false,
				-5,
			);

			// Wait to see if the proposal promise settled.
			await Promise.resolve().then(() => {});
			// Due to the composition of Quorum -> QuorumProposals, we require one more microtask deferral to resolve.
			await Promise.resolve().then(() => {});

			assert.strictEqual(resolved, false, "Stage 1, Resolved");
			assert.strictEqual(rejected, false, "Stage 1, Rejected");
			assert.strictEqual(quorum.get(proposalKey), undefined, "Stage 1, Value");

			quorum.updateMinimumSequenceNumber(approveLocalProposalMessage);

			// Wait to see if the proposal promise settled.
			await Promise.resolve().then(() => {});
			// Due to the composition of Quorum -> QuorumProposals, we require one more microtask deferral to resolve.
			await Promise.resolve().then(() => {});

			assert.strictEqual(resolved, true, "Stage 2, Resolved");
			assert.strictEqual(rejected, false, "Stage 2, Rejected");
			assert.strictEqual(quorum.get(proposalKey), localProposalValue, "Stage 2, Value");

			quorum.updateMinimumSequenceNumber(approveRemoteProposalMessage);

			// Wait to see if the proposal promise settled.
			await Promise.resolve().then(() => {});
			// Due to the composition of Quorum -> QuorumProposals, we require one more microtask deferral to resolve.
			await Promise.resolve().then(() => {});

			assert.strictEqual(resolved, true, "Stage 3, Resolved");
			assert.strictEqual(rejected, false, "Stage 3, Rejected");
			assert.strictEqual(quorum.get(proposalKey), remoteProposalValue, "Stage 3, Value");

			// Backstop to ensure the promise is settled.
			await proposalP;
		});

		describe("Disconnected handling", () => {
			it("Settling propose() promise after disconnect/reconnect", async () => {
				const proposal1 = {
					key: "one",
					value: "uno",
					sequenceNumber: 53,
					resolved: false,
					rejected: false,
				};
				const proposal2 = {
					key: "two",
					value: "dos",
					sequenceNumber: 68,
					resolved: false,
					rejected: false,
				};
				const proposal3 = {
					key: "three",
					value: "tres",
					sequenceNumber: 92,
					resolved: false,
					rejected: false,
				};

				const messageApproving1 = {
					minimumSequenceNumber: 61,
					sequenceNumber: 64,
				} as ISequencedDocumentMessage;
				const messageApproving2 = {
					minimumSequenceNumber: 77,
					sequenceNumber: 82,
				} as ISequencedDocumentMessage;
				// Proposal 3 shouldn't actually get approved, but we will test that.
				const messageApproving3 = {
					minimumSequenceNumber: 98,
					sequenceNumber: 107,
				} as ISequencedDocumentMessage;

				// Testing three scenarios:
				// - Proposal 1 will be ack'd and approved before reconnection
				// - Proposal 2 will be ack'd before reconnection, and then approved after reconnection
				// - Proposal 3 will not be ack'd before reconnection, and so should reject.
				const proposal1P = quorum
					.propose(proposal1.key, proposal1.value)
					.then(() => {
						proposal1.resolved = true;
					})
					.catch(() => {
						proposal1.rejected = true;
					});
				const proposal2P = quorum
					.propose(proposal2.key, proposal2.value)
					.then(() => {
						proposal2.resolved = true;
					})
					.catch(() => {
						proposal2.rejected = true;
					});
				const proposal3P = quorum
					.propose(proposal3.key, proposal3.value)
					.then(() => {
						proposal3.resolved = true;
					})
					.catch(() => {
						proposal3.rejected = true;
					});

				quorum.setConnectionState(false);

				// Wait to make sure the proposal promises have not settled from the disconnect.
				await Promise.resolve().then(() => {});
				// Due to the composition of Quorum -> QuorumProposals,
				// we require one more microtask deferral to resolve.
				await Promise.resolve().then(() => {});
				assert.strictEqual(proposal1.resolved, false, "Stage 1, Prop 1, Resolved");
				assert.strictEqual(proposal1.rejected, false, "Stage 1, Prop 1, Rejected");
				assert.strictEqual(proposal2.resolved, false, "Stage 1, Prop 2, Resolved");
				assert.strictEqual(proposal2.rejected, false, "Stage 1, Prop 2, Rejected");
				assert.strictEqual(proposal3.resolved, false, "Stage 1, Prop 3, Resolved");
				assert.strictEqual(proposal3.rejected, false, "Stage 1, Prop 3, Rejected");

				// Now we're simulating "connecting" state, where we will see the ack's for proposals 1 and 2
				// And also we'll advance the MSN past proposal 1
				quorum.addProposal(proposal1.key, proposal1.value, proposal1.sequenceNumber, true, 1);
				quorum.updateMinimumSequenceNumber(messageApproving1);
				quorum.addProposal(proposal2.key, proposal2.value, proposal2.sequenceNumber, true, 2);

				// Now we'll simulate the transition to connected state
				quorum.setConnectionState(true);

				// Wait to make sure the proposal promises have settled in the manner we expect.
				await Promise.resolve().then(() => {});
				// Due to the composition of Quorum -> QuorumProposals,
				// we require one more microtask deferral to resolve.
				await Promise.resolve().then(() => {});
				assert.strictEqual(proposal1.resolved, true, "Stage 2, Prop 1, Resolved");
				assert.strictEqual(proposal1.rejected, false, "Stage 2, Prop 1, Rejected");
				assert.strictEqual(proposal2.resolved, false, "Stage 2, Prop 2, Resolved");
				assert.strictEqual(proposal2.rejected, false, "Stage 2, Prop 2, Rejected");
				assert.strictEqual(proposal3.resolved, false, "Stage 2, Prop 3, Resolved");
				assert.strictEqual(proposal3.rejected, true, "Stage 2, Prop 3, Rejected");

				// Verify the quorum holds the data we expect.
				assert.strictEqual(quorum.get(proposal1.key), proposal1.value, "Value 1 missing");
				assert.strictEqual(quorum.get(proposal2.key), undefined, "Unexpected value 2");
				assert.strictEqual(quorum.get(proposal3.key), undefined, "Unexpected value 3");

				// Now advance the MSN past proposal 2
				quorum.updateMinimumSequenceNumber(messageApproving2);

				// Wait to make sure the proposal promises have settled in the manner we expect.
				await Promise.resolve().then(() => {});
				// Due to the composition of Quorum -> QuorumProposals,
				// we require one more microtask deferral to resolve.
				await Promise.resolve().then(() => {});
				assert.strictEqual(proposal1.resolved, true, "Stage 3, Prop 1, Resolved");
				assert.strictEqual(proposal1.rejected, false, "Stage 3, Prop 1, Rejected");
				assert.strictEqual(proposal2.resolved, true, "Stage 3, Prop 2, Resolved");
				assert.strictEqual(proposal2.rejected, false, "Stage 3, Prop 2, Rejected");
				assert.strictEqual(proposal3.resolved, false, "Stage 3, Prop 3, Resolved");
				assert.strictEqual(proposal3.rejected, true, "Stage 3, Prop 3, Rejected");

				// Verify the quorum holds the data we expect.
				assert.strictEqual(quorum.get(proposal1.key), proposal1.value, "Value 1 missing");
				assert.strictEqual(quorum.get(proposal2.key), proposal2.value, "Value 2 missing");
				assert.strictEqual(quorum.get(proposal3.key), undefined, "Unexpected value 3");

				// Now advance the MSN past proposal 3 (this should have no real effect)
				quorum.updateMinimumSequenceNumber(messageApproving3);

				// Wait to make sure the proposal promises have settled in the manner we expect.
				await Promise.resolve().then(() => {});
				// Due to the composition of Quorum -> QuorumProposals,
				// we require one more microtask deferral to resolve.
				await Promise.resolve().then(() => {});
				assert.strictEqual(proposal1.resolved, true, "Stage 4, Prop 1, Resolved");
				assert.strictEqual(proposal1.rejected, false, "Stage 4, Prop 1, Rejected");
				assert.strictEqual(proposal2.resolved, true, "Stage 4, Prop 2, Resolved");
				assert.strictEqual(proposal2.rejected, false, "Stage 4, Prop 2, Rejected");
				assert.strictEqual(proposal3.resolved, false, "Stage 4, Prop 3, Resolved");
				assert.strictEqual(proposal3.rejected, true, "Stage 4, Prop 3, Rejected");

				// Verify the quorum holds the data we expect.
				assert.strictEqual(quorum.get(proposal1.key), proposal1.value, "Value 1 missing");
				assert.strictEqual(quorum.get(proposal2.key), proposal2.value, "Value 2 missing");
				assert.strictEqual(quorum.get(proposal3.key), undefined, "Unexpected value 3");

				// Backstop to ensure the promises are settled.
				await Promise.all([proposal1P, proposal2P, proposal3P]);
			});
		});

		describe("Snapshot", () => {
			it("Produces the expected stable snapshot", async () => {
				const proposal1 = {
					key: "one",
					value: "uno",
					sequenceNumber: 53,
					resolved: false,
					rejected: false,
				};
				const proposal2 = {
					key: "two",
					value: "dos",
					sequenceNumber: 68,
					resolved: false,
					rejected: false,
				};
				const proposal3 = {
					key: "three",
					value: "tres",
					sequenceNumber: 92,
					resolved: false,
					rejected: false,
				};

				const messageApproving1 = {
					minimumSequenceNumber: 61,
					sequenceNumber: 64,
				} as ISequencedDocumentMessage;
				const messageApproving2 = {
					minimumSequenceNumber: 77,
					sequenceNumber: 82,
				} as ISequencedDocumentMessage;
				const messageApproving3 = {
					minimumSequenceNumber: 98,
					sequenceNumber: 107,
				} as ISequencedDocumentMessage;

				// In this test, we'll take the snapshot after proposal 1 has been accepted but not proposal 2
				const proposal1P = quorum
					.propose(proposal1.key, proposal1.value)
					.then(() => {
						proposal1.resolved = true;
					})
					.catch(() => {
						proposal1.rejected = true;
					});
				const proposal2P = quorum
					.propose(proposal2.key, proposal2.value)
					.then(() => {
						proposal2.resolved = true;
					})
					.catch(() => {
						proposal2.rejected = true;
					});
				const proposal3P = quorum
					.propose(proposal3.key, proposal3.value)
					.then(() => {
						proposal3.resolved = true;
					})
					.catch(() => {
						proposal3.rejected = true;
					});

				quorum.addProposal(proposal1.key, proposal1.value, proposal1.sequenceNumber, true, 1);
				quorum.addProposal(proposal2.key, proposal2.value, proposal2.sequenceNumber, true, 2);
				quorum.updateMinimumSequenceNumber(messageApproving1);

				const snapshot = quorum.snapshot();

				const verifyExpectedSnapshot = (): void => {
					assert.strictEqual(
						snapshot.proposals.length,
						1,
						"Should be exactly one proposal in the snapshot",
					);
					assert.strictEqual(
						snapshot.values.length,
						1,
						"Should be exactly one value in the snapshot",
					);
					assert.strictEqual(
						snapshot.proposals[0][1].value,
						"dos",
						"Proposed value should be 'dos'",
					);
					assert.strictEqual(
						snapshot.values[0][1].value,
						"uno",
						"Accepted value should be 'uno'",
					);
				};

				// Verify initial state of snapshot
				verifyExpectedSnapshot();

				// The snapshot we took should never change after we take it
				quorum.updateMinimumSequenceNumber(messageApproving2);
				verifyExpectedSnapshot();
				quorum.addProposal(proposal3.key, proposal3.value, proposal3.sequenceNumber, true, 3);
				verifyExpectedSnapshot();
				quorum.updateMinimumSequenceNumber(messageApproving3);
				verifyExpectedSnapshot();

				// Backstop to ensure the promises are settled.
				await Promise.all([proposal1P, proposal2P, proposal3P]);
			});
		});
	});

	describe("Members", () => {
		it("Add/remove members", () => {
			// Casting details because the contents don't really matter for this test.
			const client1Info = {
				clientId: "client1",
				details: "details1" as unknown as ISequencedClient,
			};
			const client2Info = {
				clientId: "client2",
				details: "details2" as unknown as ISequencedClient,
			};
			const unexpected = {
				clientId: "unexpectedId",
				details: "unexpectedDetails" as unknown as ISequencedClient,
			};
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
			assert.strictEqual(
				quorum.getMember(client1Info.clientId),
				client1Info.details,
				"Expecting client 1",
			);
			assert.strictEqual(
				quorum.getMember(client2Info.clientId),
				undefined,
				"Not expecting client 2",
			);

			expectedAdd = client2Info;
			quorum.addMember(client2Info.clientId, client2Info.details);
			assert.strictEqual(addCount, 2, "Failed to event for add");
			assert.strictEqual(
				quorum.getMembers().size,
				2,
				"Should have 2 members after second add",
			);
			assert.strictEqual(
				quorum.getMember(client1Info.clientId),
				client1Info.details,
				"Expecting client 1",
			);
			assert.strictEqual(
				quorum.getMember(client2Info.clientId),
				client2Info.details,
				"Expecting client 2",
			);

			expectedAdd = unexpected;
			expectedRemove = client1Info;
			quorum.removeMember(client1Info.clientId);
			assert.strictEqual(removeCount, 1, "Failed to event for remove");
			assert.strictEqual(quorum.getMembers().size, 1, "Should have 1 member after remove");
			assert.strictEqual(
				quorum.getMember(client1Info.clientId),
				undefined,
				"Not expecting client 1",
			);
			assert.strictEqual(
				quorum.getMember(client2Info.clientId),
				client2Info.details,
				"Expecting client 2",
			);
		});
	});

	describe("Snapshot", () => {
		it("Produces the expected stable snapshot", () => {
			// Casting details because the contents don't really matter for this test.
			const client1Info = {
				clientId: "client1",
				details: "details1" as unknown as ISequencedClient,
			};
			const client2Info = {
				clientId: "client2",
				details: "details2" as unknown as ISequencedClient,
			};

			quorum.addMember(client1Info.clientId, client1Info.details);

			const snapshot = quorum.snapshot();

			const verifyExpectedSnapshot = (): void => {
				assert.strictEqual(
					snapshot.members.length,
					1,
					"Should be exactly 1 member in the snapshot",
				);
				assert.strictEqual(snapshot.members[0][0], client1Info.clientId, "Expecting client 1");
			};

			// Verify initial state of snapshot
			verifyExpectedSnapshot();

			// The snapshot we took should never change after we take it
			quorum.addMember(client2Info.clientId, client2Info.details);
			verifyExpectedSnapshot();
			quorum.removeMember(client1Info.clientId);
			verifyExpectedSnapshot();
		});
	});
});

/* eslint-enable @typescript-eslint/consistent-type-assertions */
