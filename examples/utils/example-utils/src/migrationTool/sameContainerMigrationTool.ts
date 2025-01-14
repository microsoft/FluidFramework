/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPactMap, PactMap } from "@fluid-experimental/pact-map";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/legacy";
import { MessageType } from "@fluidframework/driver-definitions/legacy";

import type {
	ISameContainerMigrationTool,
	SameContainerMigrationState,
} from "../migrationInterfaces/index.js";

const pactMapKey = "pact-map";
const newVersionKey = "newVersion";

// RANDOM NOTES
// Should the migration tool emit state changes and such REGARDLESS of connection state, etc.?
// It would be simpler to just observe the state changing and report that, but it externalizes the knowledge that we might still be anticipating the state to continue
// changing as we connect and that the Migrator should NOT take action.  Otherwise the Migrator would need to have the knowledge that it shouldn't immediately act upon
// the state changes if not connected.

/**
 * @internal
 */
export class SameContainerMigrationTool
	extends DataObject
	implements ISameContainerMigrationTool
{
	private _pactMap: IPactMap<string> | undefined;
	private readonly _containerP: Promise<IContainer>;

	private _setContainerRef: ((container: IContainer) => void) | undefined;
	public get setContainerRef(): (container: IContainer) => void {
		if (this._setContainerRef === undefined) {
			throw new Error("_setContainerRef did not initialize properly");
		}
		return this._setContainerRef;
	}

	private _acceptedSeqNum: number | undefined;
	public get acceptedSeqNum(): number | undefined {
		return this._acceptedSeqNum;
	}

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
	 * This is synonymous with the overall migration being done (just need to reload with the latest summary).
	 */
	private _v2SummaryDone: boolean = false;

	private get pactMap() {
		if (this._pactMap === undefined) {
			throw new Error("Couldn't retrieve the PactMap");
		}
		return this._pactMap;
	}

	public get migrationState(): SameContainerMigrationState {
		// TODO: Other states
		if (this._v2SummaryDone) {
			return "migrated";
			// } else if (this._finalizationStarted) {
			// 	return "uploadingV2Summary";
		} else if (this._quorumApprovalComplete) {
			return "readyForMigration";
		} else if (this._anyQuorumProposalSeen) {
			return "waitingForV2ProposalCompletion";
		} else if (this.acceptedVersion !== undefined) {
			return "proposingV2Code";
		} else if (this.proposedVersion !== undefined) {
			return "stoppingCollaboration";
		} else if (this._proposalP !== undefined) {
			return "proposingMigration";
		} else {
			return "collaborating";
		}
	}

	public constructor(props) {
		super(props);
		this._containerP = new Promise<IContainer>((resolve) => {
			this._setContainerRef = (container: IContainer) => resolve(container);
		});
	}

	// Once we have the v2 contents in hand, we can work on sending it as the next summary (which will look like a v2
	// summary, due to the v2 code details being in the quorum).  This is the final step.
	// TODO: Real param typing
	public async finalizeMigration(v2Summary: string) {
		// TODO: Start by awaiting connected?
		// If someone else finishes this while the local client is still working on it, the local
		// client should immediately abort this step and move on to the next one.
		// Retain the summary handle for retry in subsequent phases
		// TODO: actual implementation
		// TODO: This is basically executing the summary flow outside of the container.  How much of this should stay inside the container?
		// Main concern is that we want to race it with the summary already being done by another client, and not retry after it's done.
		// TODO: We may want all clients to race to avoid the problem of the missing v2 summaryAck?  BUT need to acknowledge that sucessful upload
		// is only "done" for single-commit summary.

		// Don't allow premature calls.
		if (!this._quorumApprovalComplete) {
			throw new Error("Not ready to finalize until quorum approval has completed");
		}
		// TODO: Also guard against repeat calls
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
			// TODO: Returning a never-resolving promise for now so we at least wait on some real summary.
			return new Promise((resolve) => {});
		};
		if (this._v2SummaryDone) {
			return;
		}
		const v2SummaryHandle = await Promise.race([uploadV2Summary(v2Summary), this._v2SummaryP]);
		if (this._v2SummaryDone) {
			return;
		}
		await Promise.race([submitV2Summary(v2SummaryHandle), this._v2SummaryP]);
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

	private readonly ensureQuorumCodeDetails = async () => {
		// TODO implement for real
		// TODO Here probably need to have the container reference on the providers, in order to make the proposal?
		// Or at least a callback for it.
		const version = this.pactMap.get(newVersionKey);
		if (version === undefined) {
			throw new Error("PactMap proposal not defined before proposing on the Quorum");
		}
		const quorumProposal = { package: version };
		console.log(`Want to propose: ${JSON.stringify(quorumProposal)}`);
		this.emit("proposingV2Code");
		if (!this._anyQuorumProposalSeen) {
			const container = await this._containerP;
			// Check again, since we might have seen a proposal while waiting on the container.
			if (!this._anyQuorumProposalSeen) {
				// TODO: we should only propose if we are still in this state after fully catching up
				// TODO: awaiting here may await past an earlier proposal from someone else.  This is probably OK, since we would be waiting for our
				// own proposal to accept anyway in _quorumApprovalCompleteP but maybe something to think about.
				await container.proposeCodeDetails(quorumProposal);
			}
		}
		await this._anyQuorumProposalSeenP;
		this.emit("waitingForV2ProposalCompletion");
		await this._quorumApprovalCompleteP;
		this.emit("readyForMigration");
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

	// TODO: Consider splitting into two parts - a sync setupMigration that sets up the promises, vs. the async overseeMigration.
	// This might make it more obvious/protected that the setup of promises must happen synchronously before awaiting anything.
	private async overseeMigration() {
		// The overall strategy here is to set up all of our state observers synchronously during initialization.
		// This lets us get them ALL ready BEFORE we start processing ANY ops on top of the summary, including
		// logTail ops.  If we were to instead defer setting each one up until its respective phase starts, we'll
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
				console.log("Resolving this._pendingP: Pending proposal already exists at load time");
				resolve();
				return;
			}

			// If no proposal has been accepted or is pending, we wait for the proposal to be made.
			// The proposal will be set by someone calling proposeVersion().
			const watchForPending = (key: string) => {
				if (key === newVersionKey) {
					this.pactMap.off("pending", watchForPending);
					console.log("Resolving this._pendingP: Saw pending proposal during run time");
					resolve();
				}
			};
			this.pactMap.on("pending", watchForPending);
		});

		this._acceptedP = new Promise<void>((resolve) => {
			const pactWithDetails = this.pactMap.getWithDetails(newVersionKey);
			if (pactWithDetails !== undefined) {
				this._acceptedSeqNum = pactWithDetails.acceptedSequenceNumber;
				console.log(
					"Resolving this._acceptedP: Acceptance already exists at load time at sequence number:",
					this.acceptedSeqNum,
				);
				resolve();
				return;
			}

			const watchForAccepted = (key: string) => {
				if (key === newVersionKey) {
					this.pactMap.off("accepted", watchForAccepted);
					this._acceptedSeqNum =
						this.pactMap.getWithDetails(newVersionKey)?.acceptedSequenceNumber;
					if (this._acceptedSeqNum === undefined) {
						throw new Error("Could not retrieve accepted sequence number");
					}
					console.log(
						"Resolving this._acceptedP: Saw acceptance during run time at sequence number:",
						this.acceptedSeqNum,
					);
					resolve();
				}
			};
			this.pactMap.on("accepted", watchForAccepted);
		});

		this._anyQuorumProposalSeenP = new Promise<void>((resolve) => {
			// Here we want to watch the quorum and resolve on the first sequenced proposal.
			// This is also awkward because the only clean eventing is on the QuorumProposals itself, or the Container.
			// For now, spying on the deltaManager and using insider knowledge about how the QuorumProposals works.
			// TODO: Consider if there is any better way to watch this happen
			const watchForQuorumProposal = (op: ISequencedDocumentMessage) => {
				if (
					op.type === MessageType.Propose &&
					(op.contents as { key?: unknown }).key === "code"
				) {
					// TODO Is this also where I want to emit an internal state event of the proposal coming in to help with abort flows?
					// Or maybe set that up in ensureQuorumCodeDetails().
					this.context.deltaManager.off("op", watchForQuorumProposal);
					this._anyQuorumProposalSeen = true;
					console.log("Resolving this._anyQuorumProposalSeenP");
					resolve();
				}
			};
			// TODO: Consider if watching container.on("codeDetailsProposed", ...) might be more appropriate.
			this.context.deltaManager.on("op", watchForQuorumProposal);
		});

		this._quorumApprovalCompleteP = new Promise<void>((resolve) => {
			// Here we want to watch the quorum and track all proposals, and resolve on the MSN advancing past the last one's sequence number.
			// This is even more awkward than the proposal tracking, because there is no event for proposal acceptance on the Container, only on the QuorumProposals.
			// Again for now, spying on the deltaManager and using insider knowledge.
			// TODO: Consider if there is any better way to watch this happen
			const proposalSequenceNumbers: number[] = [];
			const watchForLastQuorumAccept = (op: ISequencedDocumentMessage) => {
				if (
					op.type === MessageType.Propose &&
					(op.contents as { key?: unknown }).key === "code"
				) {
					proposalSequenceNumbers.push(op.sequenceNumber);
				}
				if (
					proposalSequenceNumbers.length > 0 &&
					proposalSequenceNumbers.every(
						(sequenceNumber) => sequenceNumber <= op.minimumSequenceNumber,
					)
				) {
					this.context.deltaManager.off("op", watchForLastQuorumAccept);
					this._quorumApprovalComplete = true;
					console.log("Resolving this._quorumApprovalCompleteP");
					resolve();
				}
			};
			// TODO: Consider if watching container.on("codeDetailsProposed", ...) might be more appropriate.
			// Note container.on("codeDetailsProposed", (, proposal) => { proposal.sequenceNumber })
			// This will let us learn the sequence number of each proposal that comes in.
			// Unfortunately no event on proposal acceptance (from the container) but we can still watch the MSN
			// ourselves to know when we're done processing them?
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
				if (op.type === MessageType.SummaryAck) {
					assert(this.acceptedSeqNum !== undefined, "this.acceptedSeqNum should be defined");
					acksSeen++;
					// TODO Is this also where I want to emit an internal state event of the ack coming in to help with abort flows?
					// Or maybe set that up in ensureV1Summary().  Note as mentioned above, waiting for 2 acks here is a hack.
					if (acksSeen === 2) {
						this.context.deltaManager.off("op", watchForV2Ack);
						this._v2SummaryDone = true;
						console.log("Resolving this._v2SummaryP");
						resolve();
					}
				}
			};
			this.context.deltaManager.on("op", watchForV2Ack);
		});

		// Here we start the actual migration flow.  We await each of the promises we set up in sequence (this is a linear flow), and
		// take the expected steps in between to advance to the next step.

		// The flow kicks off when a proposal goes pending (which may come either from the local client calling proposeVersion() or
		// from some remote client doing the same).
		await this._pendingP;
		// After the proposal is detected to be pending (or accepted), we must stop collaboration and summarization
		// to avoid unexpected ops and summaries sneaking in after the proposal's acceptance.
		// TODO: Determine if we need to stop collaboration within the promise executor to avoid something slipping
		// in between the microtasks - bearing in mind that we still need to send out our accept op.
		this.stopCollaboration();
		await this._acceptedP;

		// The last step to prepare for the migration phase is to put the new code details into the quorum.  We have to
		// do this here to ensure the correct summary is produced for services that have server-produced .protocol trees.
		await this.ensureQuorumCodeDetails();

		// The flow blocks at this point until the user calls finalizeMigration().  That call will ultimately submit the
		// v2 summary and resolve this promise.
		await this._v2SummaryP;

		this.emit("migrated");

		// TODO: close and dispose somewhere in here

		console.log("All done!");
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 * @internal
 */
export const SameContainerMigrationToolInstantiationFactory =
	new DataObjectFactory<SameContainerMigrationTool>(
		"migration-tool",
		SameContainerMigrationTool,
		[PactMap.getFactory()],
		{},
	);
