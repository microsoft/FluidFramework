/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * The collaboration session may be in one of these states:
 * * collaborating - normal collaboration is ongoing.  The client may send data.
 * * proposingMigration - a proposal to migrate has been sent by the local client, but not sequenced yet.  The client doesn't strictly have to stop sending data until it goes pending.
 * * stoppingCollaboration - a proposal to migrate has been sequenced, but not accepted yet.  The client must stop sending data.
 * // TODO should there be an event here for non-summarizer clients to observe (collaborationStopped maybe) since they won't be generating the summary?
 * // TODO: "V1" and "V2" aren't really appropriate here since we don't know the actual version numbers.  Probably prefer "old"/"current" vs. "new"/"next" or something like that.
 * * generatingV1Summary - the proposal has been accepted and we have started generating the final v1 summary locally, reflecting the state at the time of the acceptance.
 * * uploadingV1Summary - the final v1 summary has been generated locally and the local client is in the process of uploading it to the service.
 * * submittingV1Summary - the final v1 summary has been uploaded by the local client and is sending the summarize op, awaiting its summaryAck.
 * * proposingV2Code - the local client is in the process of proposing v2 code
 * * waitingForV2ProposalCompletion - at least one v2 code proposal has been approved, and we are waiting on remaining outstanding proposals to be approved.
 * * readyForMigration - awaiting a call to migrationTool.finalizeTransform(v2Summary)
 * * uploadingV2Summary - similar to above
 * * submittingV2Summary - similar to above
 * * migrated - migration has completed, if the client reloads from the latest summary they will be on v2.
 * @internal
 */
export type SameContainerMigrationState =
	| "collaborating"
	| "proposingMigration"
	| "stoppingCollaboration"
	// TODO: "waitingForV2Proposal"?  Not a guarantee that we will issue a proposal here, if we see the proposal during catch up?
	| "proposingV2Code"
	| "waitingForV2ProposalCompletion"
	| "readyForMigration"
	| "uploadingV2Summary"
	| "submittingV2Summary"
	| "migrated";

// TODO: Consider whether these should be after-the-fact events (collaborationStopped)
/**
 * @internal
 */
export interface ISameContainerMigrationToolEvents extends IEvent {
	(
		event:
			| "proposingMigration"
			| "stoppingCollaboration"
			| "proposingV2Code"
			| "waitingForV2ProposalCompletion"
			| "readyForMigration"
			| "uploadingV2Summary"
			| "submittingV2Summary"
			| "migrated",
		listener: () => void,
	);
}

/**
 * @internal
 */
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
	readonly proposeVersion: (newVersion: string) => void;

	/**
	 * Give a container reference to the migration tool.  The migration tool must have this reference in order to
	 * complete the migration flow, otherwise it won't be able to progress past proposingV2Code state.
	 * TODO: Later consider whether we can reduce the scope of what's provided to the tool.  Does it need the whole IContainer,
	 * or could we just give it a callback to proposeCodeDetails()?
	 * @param container - the reference to the IContainer associated with this migration tool
	 */
	readonly setContainerRef: (container: IContainer) => void;

	/**
	 * The sequence number that the proposal was accepted at. It will be defined once we reach the "proposingV2Code" migration state,
	 * and undefined before reaching that state.
	 */
	get acceptedSeqNum(): number | undefined;
}
