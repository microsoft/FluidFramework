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
		// TODO: First figure out what state we're in probably?  Wait for first connected state?
		// Maybe have this emit purely on the op stream but have the Migrator wait for connected state to take any action?
		// All of this runs before processing the incoming ops (we'll just have the snapshot loaded here).
		// Maybe don't need to deduce it or do anything special as long as all the "taking action" steps have
		// guards to wait for connected state.
		// We need guards set up from the start I think, because the logTail probably gets processed synchronously.
		// So even though it would be resolving these promises, if there's more than one then we wouldn't be able
		// to get subsequent promises set up to awaiting the next op processing in time.

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
		// Once we get here the proposal is either pending or accepted.
		// This could either be that the snapshot already had the proposal in one of these states (so we
		// didn't need to wait above), or we encountered a proposal op during catchup or normal operation.
		// In response, we need to stop normal collaboration and summarization.
		// TODO: Determine if we need to stop collaboration within the promise executor to avoid something slipping
		// in between the microtasks - bearing in mind that we still might need to send out our accept op.
		this.stopCollaboration();
		await this._acceptedP;

		// Once we get here the proposal is accepted (either from the snapshot or from an op).
		// In response, we need to ensure the final v1 summary is taken.
		// Even if we load from this v1 summary we will still see its summarize and summaryAck in the logTail
		await this.ensureV1Summary();

		await this.ensureQuorumCodeDetails();

		// TODO: Here we're going to be waiting for the finalize step

		await this.ensureV2Summary();

		this.emit("migrated");

		// These states are purely the ones that can be detected in the data/opstream, one-way transition.
		// Should also do states for the runtime bits like submitting the v2 summary?
		// Or alternatively, could go simpler like "preparingForMigration", "readyForMigration", "migrated"

		// All one-way transitions (including in-memory state)
		// collaborating (base state in v1)
		// proposingMigration (if the local client has sent a proposal but not gotten an ack yet?)
		// stoppingCollaboration (between proposal and acceptance)
		// generatingV1Summary (we can retain this for retries of upload)
		// uploadingV1Summary (we can retain the handle to it for retries of submission)
		// submittingV1Summary (completion visible in op stream as summaryAck)
		// proposingV2Code
		// waitingForV2ProposalCompletion - waiting for proposal flurry to finish
		// readyForMigration (awaiting a call to migrationTool.finalizeTransform(v2summary))
		// uploadingV2Summary (can retain the contents in case we need to retry the upload, can retain the handle for retries of submission)
		// submittingV2Summary (completion visible in op stream as summaryAck)
		// migrated

		// Detectable in the data/opstream, one-way transition
		// stopping
		// summarizingV1 + proposingV2QuorumCode === preparingForExport?
		// readyForMigration
		// migrated

		// MigrationTool probably gets additional states beyond migrating/migrated.  But Migrator keeps just the simple
		// two-state because its consumers just need to know whether it's ready for render, etc.
		// ???.on("v1SummaryAck", this.emit("readyForExport")) // Maybe this includes a sequence number for loading?
		// ???.on("v1SummaryAck", proposeQuorumCodeDetails)

		// after the summary ack emit, the migrator will respond by doing export/transform/import into v2, and get that snapshot
		// Next we hear back should be Migrator calling a migrationTool.finalizeTransform(v2summary) or something

		// ???.on("v2SummaryAck", this.emit("readyForReload"))
		// ???.on("v2SummaryAck", closeAndDispose)

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
