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
		// TODO Also force the container to go silent and kill summarizers
		this.emit("stoppingCollaboration");
	};

	private readonly ensureV1Summary = () => {};

	protected async initializingFirstTime() {
		const pactMap = PactMap.create(this.runtime);
		this.root.set(pactMapKey, pactMap.handle);
	}

	protected async hasInitialized() {
		// TODO: First figure out what state we're in probably?

		const pactMapHandle = this.root.get<IFluidHandle<IPactMap<string>>>(pactMapKey);
		this._pactMap = await pactMapHandle?.get();

		this.pactMap.on("pending", (key: string) => {
			if (key === newVersionKey) {
				this.stopCollaboration();
			}
		});

		this.pactMap.on("accepted", (key: string) => {
			if (key === newVersionKey) {
				// TODO Here also do the final v1 summarization
				this.ensureV1Summary();
				// After summarization completes need another state transition
				this.emit("migrating");
			}
		});

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
