/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";

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

/**
 * The collaboration session may be in one of four states:
 * * collaborating - normal collaboration is ongoing.  The client may send data.
 * * stopping - a proposal to migrate has been made, but not accepted yet.  The client must stop sending data.
 * * migrating - a proposal to migrate has been accepted.  The data is currently being migrated.
 * * migrated - migration has completed and the new container is available.
 */
export type SameContainerMigrationState =
	| "collaborating"
	| "proposingMigration"
	| "stoppingCollaboration"
	| "generatingV1Summary"
	| "uploadingV1Summary"
	| "submittingV1Summary"
	| "proposingV2Code"
	| "waitingForV2ProposalCompletion"
	| "readyForMigration"
	| "uploadingV2Summary"
	| "submittingV2Summary"
	| "migrated";

export interface ISameContainerMigrationToolEvents extends IEvent {
	(
		event:
			| "proposingMigration"
			| "stoppingCollaboration"
			| "generatingV1Summary"
			| "uploadingV1Summary"
			| "submittingV1Summary"
			| "proposingV2Code"
			| "waitingForV2ProposalCompletion"
			| "readyForMigration"
			| "uploadingV2Summary"
			| "submittingV2Summary"
			| "migrated",
		listener: () => void,
	);
}

export interface ISameContainerMigrationTool
	extends IEventProvider<ISameContainerMigrationToolEvents> {
	/**
	 * The current state of migration.
	 */
	readonly migrationState: SameContainerMigrationState;

	/**
	 * Set the container id where the migrated content can be found, finalizing the migration.
	 * @param id - the container id
	 */
	finalizeMigration(id: string): Promise<void>;

	/**
	 * The version string of the proposed new version to use, if one has been proposed.
	 */
	readonly proposedVersion: string | undefined;
	/**
	 * The version string of the accepted new version to use, if one has been accepted.
	 */
	readonly acceptedVersion: string | undefined;
	/**
	 * Propose a new version to use.
	 * @param newVersion - the version string
	 */
	proposeVersion: (newVersion: string) => void;
}
