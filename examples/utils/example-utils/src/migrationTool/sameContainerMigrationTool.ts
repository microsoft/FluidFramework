/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPactMap, PactMap } from "@fluid-experimental/pact-map";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

import type { ISameContainerMigrationTool } from "../migrationInterfaces";

const pactMapKey = "pact-map";
const newVersionKey = "newVersion";

// RANDOM NOTES
// Should the migration tool emit state changes and such REGARDLESS of connection state, etc.?
// It would be simpler to just observe the state changing and report that, but it externalizes the knowledge that we might still be anticipating the state to continue
// changing as we connect and that the Migrator should NOT take action.  Otherwise the Migrator would need to have the knowledge that it shouldn't immediately act upon
// the state changes if not connected.

export class SameContainerMigrationTool extends DataObject implements ISameContainerMigrationTool {
	private _pactMap: IPactMap<string> | undefined;

	/**
	 * A promise that is only defined if the local client has made a proposal, and will resolve when any proposal goes pending.
	 * Not all clients will have a _proposalP, if they do not make the proposal.  Those clients instead will only see a remote proposal come in and advance
	 * directly from "collaborating" to "stoppingCollaboration".
	 */
	private _proposalP: Promise<void> | undefined;
	/**
	 * A promise that will resolve when the proposal is either pending or accepted, signalling that we have moved on to a later stage of the migration.
	 */
	private _pendingP: Promise<void> | undefined;
	/**
	 * A promise that will resolve when the proposal is accepted.
	 */
	private _acceptedP: Promise<void> | undefined;
	/**
	 * A promise that will resolve when we know the final v1 summary was successfully submitted.
	 * Note that even when loading from that summary, we should expect to see the summaryAck as part of the logTail
	 */
	private _v1SummaryP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if the v1 summary is done.
	 */
	private _v1SummaryDone: boolean = false;
	/**
	 * A promise that will resolve upon seeing the _first_ proposal, even before it is approved.  This lets us know that we don't need to submit our own proposal.
	 */
	private _anyQuorumProposalSeenP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if we have seen the first proposal.
	 */
	private _anyQuorumProposalSeen: boolean = false;
	/**
	 * A promise that will resolve when we've seen the _last_ v2 code proposal get approved (meaning it's safe to move on to the next step).
	 */
	private _quorumApprovalCompleteP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if we have seen the final approval.
	 */
	private _quorumApprovalComplete: boolean = false;
	/**
	 * A promise that will resolve when we know the v2 summary was successfully submitted.
	 */
	private _v2SummaryP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if the v2 summary is done.
	 */
	private _v2SummaryDone: boolean = false;

	private get pactMap() {
		if (this._pactMap === undefined) {
			throw new Error("Couldn't retrieve the PactMap");
		}
		return this._pactMap;
	}

	public get migrationState() {
		// if (this.newContainerId !== undefined) {
		// 	return "migrated";
		// } else ...
		if (this.acceptedVersion !== undefined) {
			return "generatingV1Summary";
		} else if (this.proposedVersion !== undefined) {
			return "stoppingCollaboration";
		} else if (this._proposalP !== undefined) {
			return "proposingMigration";
		} else {
			return "collaborating";
		}
	}

	public async finalizeMigration(id: string) {
		// TODO this now probably looks like passing in the v2 summary
	}

	public get proposedVersion() {
		return this.pactMap.getPending(newVersionKey) ?? this.pactMap.get(newVersionKey);
	}

	public get acceptedVersion() {
		return this.pactMap.get(newVersionKey);
	}

	public readonly proposeVersion = (newVersion: string) => {
		// Don't permit changes to the version once the migration starts.
		if (this.migrationState !== "collaborating") {
			throw new Error("Migration already in progress");
		}

		// TODO: Consider retry logic here.
		this._proposalP = new Promise<void>((resolve) => {
			const watchForPending = (key: string) => {
				if (key === newVersionKey) {
					this.pactMap.off("pending", watchForPending);
					resolve();
				}
			};
			this.pactMap.on("pending", watchForPending);
		});

		// Note that the accepted proposal could come from another client (e.g. two clients try to propose
		// simultaneously).
		this.pactMap.set(newVersionKey, newVersion);

		this.emit("proposingMigration");
	};

	private readonly stopCollaboration = () => {
		// TODO Actually force the container to go silent and kill summarizers
		this.emit("stoppingCollaboration");
	};

	private readonly ensureV1Summary = async () => {
		// TODO: Start by awaiting connected?
		// If someone else finishes this while the local client is still working on it, the local
		// client should immediately abort this step and move on to the next one.
		// Retain the generated summary and summary handle for retry in subsequent phases
		// TODO: actual implementation
		// TODO: This is basically executing the summary flow outside of the container.  How much of this should stay inside the container?
		// Main concern is that we want to race it with the summary already being done by another client, and not retry after it's done.
		// TODO: We may want all clients to race to avoid the problem of the missing v1 summaryAck?
		const generateV1Summary = async () => {
			// TODO: retry also
			this.emit("generatingV1Summary");
			return "This is the v1 summary I generated";
		};
		const uploadV1Summary = async (_v1Summary) => {
			// Do upload of v1Summary
			// TODO: Retry also
			this.emit("uploadingV1Summary");
			console.log(_v1Summary);
			return "This is the handle I got back after successfully uploading the v1 summary";
		};
		const submitV1Summary = async (_v1SummaryHandle) => {
			// Submit summarize op for v1Summary
			this.emit("submittingV1Summary");
			// TODO: Retry also
		};
		const v1Summary = await Promise.race([generateV1Summary(), this._v1SummaryP]);
		if (this._v1SummaryDone) {
			return;
		}
		const v1SummaryHandle = await Promise.race([uploadV1Summary(v1Summary), this._v1SummaryP]);
		if (this._v1SummaryDone) {
			return;
		}
		await submitV1Summary(v1SummaryHandle);
		// (this.context.containerRuntime as any).summarizeOnDemand({ reason: "because" });
	};

	private readonly ensureV2Summary = async () => {
		// TODO: Start by awaiting connected?
		// If someone else finishes this while the local client is still working on it, the local
		// client should immediately abort this step and move on to the next one.
		// Retain the generated summary and summary handle for retry in subsequent phases
		// TODO: actual implementation
		// TODO: This is basically executing the summary flow outside of the container.  How much of this should stay inside the container?
		// Main concern is that we want to race it with the summary already being done by another client, and not retry after it's done.
		// TODO: We may want all clients to race to avoid the problem of the missing v2 summaryAck?
		const generateV2Summary = async () => {
			// TODO: retry also
			this.emit("generatingV2Summary");
			return "This is the v2 summary I generated";
		};
		const uploadV2Summary = async (_v2Summary) => {
			// Do upload of v2Summary
			// TODO: Retry also
			this.emit("uploadingV2Summary");
			console.log(_v2Summary);
			return "This is the handle I got back after successfully uploading the v2 summary";
		};
		const submitV2Summary = async (_v2SummaryHandle) => {
			// Submit summarize op for v2Summary
			this.emit("submittingV2Summary");
			// TODO: Retry also
		};
		const v2Summary = await Promise.race([generateV2Summary(), this._v2SummaryP]);
		if (this._v2SummaryDone) {
			return;
		}
		const v2SummaryHandle = await Promise.race([uploadV2Summary(v2Summary), this._v2SummaryP]);
		if (this._v2SummaryDone) {
			return;
		}
		await submitV2Summary(v2SummaryHandle);
		// (this.context.containerRuntime as any).summarizeOnDemand({ reason: "because" });
	};

	private readonly ensureQuorumCodeDetails = async () => {
		// TODO implement for real
		const version = this.pactMap.get(newVersionKey);
		const quorumProposal = { package: version };
		console.log(`Want to propose: ${JSON.stringify(quorumProposal)}`);
		console.log(this._anyQuorumProposalSeenP, this._anyQuorumProposalSeen);
		console.log(this._quorumApprovalCompleteP, this._quorumApprovalComplete);
		// TODO Here probably need to have the container reference on the providers, in order to make the proposal?
		// Or at least a callback for it.
		// container.proposeCodeDetails(quorumProposal);
		// on("quorumDetailsAccepted", waitForV2ProposalCompletion)
		// Can watch container.on("codeDetailsProposed", (, proposal) => { proposal.sequenceNumber })
		// This will let us learn the sequence number of each proposal that comes in.
		// Unfortunately no event on proposal acceptance (from the container) but we can still watch the MSN
		// ourselves to know when we're done processing them.
		// on("v2ProposalCompletion", this.emit("readyForMigration"))
	};

	protected async initializingFirstTime() {
		const pactMap = PactMap.create(this.runtime);
		this.root.set(pactMapKey, pactMap.handle);
	}

	protected async hasInitialized() {
		const pactMapHandle = this.root.get<IFluidHandle<IPactMap<string>>>(pactMapKey);
		this._pactMap = await pactMapHandle?.get();

		// TODO real error handling
		this.overseeMigration().catch(console.error);
	}

	private async overseeMigration() {
		// The overall strategy here is to set up all of our state observers synchronously upon instantiation.
		// This lets us get them all ready BEFORE we start processing ANY ops on top of the summary, including
		// logTail ops.  If we were to instead defer setting them up until the respective phase starts, we'll
		// frequently miss the op we're looking for because it will already have been processed before our
		// microtask runs.

		// We must not miss any ops to correctly observe the summaryAcks and quorum proposals:
		// * The summaryAcks aren't inspectable after they've been processed
		// * The quorum eventing makes it challenging to understand state when proposals are racing.

		this._pendingP = new Promise<void>((resolve) => {
			if (
				this.pactMap.get(newVersionKey) !== undefined ||
				this.pactMap.getPending(newVersionKey) !== undefined
			) {
				resolve();
				return;
			}

			// If no proposal has been accepted or is pending, we wait for the proposal to be made.
			// The proposal will be set by someone calling proposeVersion().
			const watchForPending = (key: string) => {
				if (key === newVersionKey) {
					this.pactMap.off("pending", watchForPending);
					resolve();
				}
			};
			this.pactMap.on("pending", watchForPending);
		});

		this._acceptedP = new Promise<void>((resolve) => {
			if (this.pactMap.get(newVersionKey) !== undefined) {
				resolve();
				return;
			}

			const watchForAccepted = (key: string) => {
				if (key === newVersionKey) {
					this.pactMap.off("accepted", watchForAccepted);
					resolve();
				}
			};
			this.pactMap.on("accepted", watchForAccepted);
		});

		this._v1SummaryP = new Promise<void>((resolve) => {
			// TODO implement for real
			// Challenge here: ContainerRuntime only emits "op" for runtime ops, which doesn't include summaryAck.
			// SummaryCollection's approach is to go listen to the deltaManager directly, which is gross but works.
			// Alternatively could have ContainerRuntime emit some summaryAck event
			// TODO Figure out plan for when the summaryAck is missing entirely
			const watchForV1Ack = (op: ISequencedDocumentMessage) => {
				// TODO: This should also be checking that the summaryAck is actually the one we expect to see, not just some
				// random ack.  Probably means storing the PactMap accept sequence number and verifying the summary is based on that sequence number.
				// Probably not the referenceSequenceNumber, since the summarizer will be generating based on a sequence number that is probably below the MSN.
				// TODO: Not really appropriate to check the pactMap here, I'm just using this as an approximation of v1 summaryAck detection
				// as in "Is this the first summary we've seen after proposal acceptance".
				if (
					this.pactMap.get(newVersionKey) !== undefined &&
					op.type === MessageType.SummaryAck
				) {
					// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
					// Or maybe set that up in ensureV1Summary().
					this.context.deltaManager.off("op", watchForV1Ack);
					this._v1SummaryDone = true;
					resolve();
				}
			};
			this.context.deltaManager.on("op", watchForV1Ack);
		});

		this._anyQuorumProposalSeenP = new Promise<void>((resolve) => {
			// TODO implement for real
			// Here we want to watch the quorum and resolve on the first sequenced proposal.
			// This is also awkward because the only clean eventing is on the QuorumProposals itself, or the Container.
			// For now, spying on the deltaManager and using insider knowledge about how the QuorumProposals works.
			const watchForQuorumProposal = (op: ISequencedDocumentMessage) => {
				// TODO: Also verify the proposal looks like what we expect
				if (op.type === MessageType.Propose) {
					// TODO Is this also where I want to emit an internal state event of the proposal coming in to help with abort flows?
					// Or maybe set that up in ensureQuorumCodeDetails().
					this.context.deltaManager.off("op", watchForQuorumProposal);
					this._anyQuorumProposalSeen = true;
					resolve();
				}
			};
			this.context.deltaManager.on("op", watchForQuorumProposal);
		});

		this._quorumApprovalCompleteP = new Promise<void>((resolve) => {
			// TODO implement for real
			// Here we want to watch the quorum and track all proposals, and resolve on the MSN advancing past the last one's sequence number.
			// This is even more awkward than the proposal tracking, because there is no event for proposal acceptance on the Container, only on the QuorumProposals.
			// Again for now, spying on the deltaManager and using insider knowledge.
			const proposalSequenceNumbers: number[] = [];
			const watchForLastQuorumAccept = (op: ISequencedDocumentMessage) => {
				// TODO: Also verify the proposals looks like what we expect
				if (op.type === MessageType.Propose) {
					proposalSequenceNumbers.push(op.sequenceNumber);
				}
				if (
					proposalSequenceNumbers.length > 0 &&
					proposalSequenceNumbers.every(
						(sequenceNumber) => sequenceNumber <= op.minimumSequenceNumber,
					)
				) {
					// TODO Is this also where I want to emit an internal state event of the proposal coming in to help with abort flows?
					// Or maybe set that up in ensureQuorumCodeDetails().
					this.context.deltaManager.off("op", watchForLastQuorumAccept);
					this._quorumApprovalComplete = true;
					resolve();
				}
			};
			this.context.deltaManager.on("op", watchForLastQuorumAccept);
		});

		this._v2SummaryP = new Promise<void>((resolve) => {
			// TODO implement for real
			// Here we want to watch for the v2 summary which will signify that migration is complete and we can reload to start running v2.
			// Similar challenges to watching for the v1 ack, but one additional challenge is that we don't know exactly what the referenceSequenceNumber
			// should be.  Should be watching for the summaryAck to come in.
			// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
			// Or maybe set that up in ensureV2Summary().
			// TODO: acksSeen is a hack, I'm just doing this as an approximation of v2 summary
			// detection as in "is this at least the second summaryAck we've seen"
			// TODO Figure out plan for when the summaryAck is missing entirely
			let acksSeen = 0;
			const watchForV2Ack = (op: ISequencedDocumentMessage) => {
				// TODO: This should also be checking that the summaryAck is actually the one we expect to see, not just some
				// random ack.  Probably means storing the Quorum code accept sequence number and verifying the summary is based on that sequence number.
				// Would be good if we can verify the contents somehow too.
				// TODO: Not appropriate to be watching _seenV1SummaryAck here, I'm just doing this to simulate second ack after acceptance
				if (this._v1SummaryDone && op.type === MessageType.SummaryAck) {
					acksSeen++;
					// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
					// Or maybe set that up in ensureV1Summary().
					if (acksSeen === 2) {
						this.context.deltaManager.off("op", watchForV2Ack);
						this._v2SummaryDone = true;
						resolve();
					}
				}
			};
			this.context.deltaManager.on("op", watchForV2Ack);
		});

		// Here we start the actual migration flow.  We await each of the promises we set up in sequence (this is a linear flow), and
		// take the expected steps in between to advance to the next step.

		await this._pendingP;
		// After the proposal is detected to be pending (or accepted), we must stop collaboration and summarization
		// to avoid unexpected ops and summaries sneaking in after the proposal's acceptance.
		// TODO: Determine if we need to stop collaboration within the promise executor to avoid something slipping
		// in between the microtasks - bearing in mind that we still need to send out our accept op.
		this.stopCollaboration();
		await this._acceptedP;

		// After the proposal is detected to be accepted, we need to ensure the final v1 summary is taken.
		// Even if a client loads from this v1 summary it will still see its summarize and summaryAck in the logTail and
		// know that this step is done.
		await this.ensureV1Summary();

		// The last step to prepare for the migration phase is to put the new code details into the quorum.  We have to
		// do this here to ensure the correct summary is produced for services that have server-produced .protocol trees.
		await this.ensureQuorumCodeDetails();

		// TODO: At this point we need to await the finalizeMigration call.

		// Once we have the v2 contents in hand, we can work on sending it as the next summary (which will look like a v2
		// summary, due to the v2 code details being in the quorum).  This is the final step.
		await this.ensureV2Summary();

		this.emit("migrated");

		// TODO: close and dispose somewhere in here

		console.log("All done!");
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const SameContainerMigrationToolInstantiationFactory =
	new DataObjectFactory<SameContainerMigrationTool>(
		"migration-tool",
		SameContainerMigrationTool,
		[PactMap.getFactory()],
		{},
	);
