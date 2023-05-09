/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPactMap, PactMap } from "@fluid-experimental/pact-map";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

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

	// Not all clients will have a _proposalP, this is only if the local client issued a proposal.
	// Clients that only see a remote proposal come in will advance directly from "collaborating" to "stoppingCollaboration".
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
	 * A promise that will resolve when the final v1 summaryAck is seen.
	 * Note that even when loading from that summary, we should expect to see the summaryAck as part of the logTail
	 */
	private _v1SummaryAckP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if we have seen the v1 summaryAck.
	 */
	private _seenV1SummaryAck: boolean = false;
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
	 * A promise that will resolve when the v2 summaryAck is seen.
	 */
	private _v2SummaryAckP: Promise<void> | undefined;
	/**
	 * This boolean will make it easier to synchronously determine if we have seen the v2 summaryAck.
	 */
	private _seenV2SummaryAck: boolean = false;

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
		const generateV1Summary = async () => {
			// TODO: retry also
			this.emit("generatingV1Summary");
			return "v1Summary";
		};
		const uploadV1Summary = async (_v1Summary) => {
			// Do upload of v1Summary
			// TODO: Retry also
			this.emit("uploadingV1Summary");
			console.log(_v1Summary);
			return "v1SummaryHandle";
		};
		const submitV1Summary = async (_v1SummaryHandle) => {
			// Submit summarize op for v1Summary
			this.emit("submittingV1Summary");
			// TODO: Retry also
		};
		const v1Summary = await generateV1Summary();
		const v1SummaryHandle = await uploadV1Summary(v1Summary);
		await submitV1Summary(v1SummaryHandle);
	};

	private readonly ensureV2Summary = async () => {
		// TODO implement
		// on("v2summaryAck", this.emit("migrated"))
	};

	private readonly ensureQuorumCodeDetails = async () => {
		// TODO implement
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

		this._v1SummaryAckP = new Promise<void>((resolve) => {
			// TODO implement
			// Should be watching for the summaryAck to come in.
			// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
			// Or maybe set that up in ensureV1Summary().
			this._seenV1SummaryAck = true;
			resolve();
		});

		this._anyQuorumProposalSeenP = new Promise<void>((resolve) => {
			// TODO implement
			// Need to watch the quorum and resolve on the first sequenced proposal.
			// TODO Also will want to emit state here probably to abort any ongoing attempts to propose it ourselves.
			this._anyQuorumProposalSeen = true;
			resolve();
		});

		this._quorumApprovalCompleteP = new Promise<void>((resolve) => {
			// TODO implement
			// Need to watch the quorum and track the final proposal, and resolve on the MSN advancing past its sequence number.
			this._quorumApprovalComplete = true;
			resolve();
		});

		this._v2SummaryAckP = new Promise<void>((resolve) => {
			// TODO implement
			// Should be watching for the summaryAck to come in.
			// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
			// Or maybe set that up in ensureV2Summary().
			this._seenV2SummaryAck = true;
			resolve();
		});

		await this._pendingP;
		// After the proposal is detected to be pending (or accepted), we must stop collaboration and summarization
		// to avoid unexpected ops and summaries sneaking in after the proposal's acceptance.
		// TODO: Determine if we need to stop collaboration within the promise executor to avoid something slipping
		// in between the microtasks - bearing in mind that we still might need to send out our accept op.
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

		// Make build shut up
		await this._v1SummaryAckP;
		console.log(this._seenV1SummaryAck);
		await this._anyQuorumProposalSeenP;
		console.log(this._anyQuorumProposalSeen);
		await this._quorumApprovalCompleteP;
		console.log(this._quorumApprovalComplete);
		await this._v2SummaryAckP;
		console.log(this._seenV2SummaryAck);
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
