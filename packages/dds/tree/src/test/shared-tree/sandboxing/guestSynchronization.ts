/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { LogLevel } from "@fluidframework/core-interfaces";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ChangeMetadata } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema } from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

import {
	type AcknowledgmentMessage,
	type DataChangeMessage,
	getRevision,
	makePromiseWithResolvers,
	type PromiseWithResolvers,
	SandboxProtocolError,
} from "./common.js";

/**
 * Synchronizes the Guest's view with the Host.
 * @remarks
 * This class owns branch synchronization only.
 * The `Guest` owns initialization, transport encoding, message routing, and session lifetime.
 */
export class GuestSynchronization<const TSchema extends ImplicitFieldSchema> {
	/** The number of local Guest changes that the Host has not acknowledged. */
	private inFlight: number = 0;
	/**
	 * The promise and resolver for the process of sending changes to the Host.
	 * When this is defined, the Host has not acknowledged all Guest changes.
	 */
	private pushInProgress?: PromiseWithResolvers;
	/** The callback that unsubscribes from view changes. */
	private readonly offViewChanged: () => void;
	/** Whether the Guest is applying changes from the Host. */
	private isApplyingChangesFromHost: boolean = false;
	/**
	 * Whether synchronization has stopped.
	 *
	 * @remarks
	 * Stopping is terminal and removes the view-change listener.
	 * It occurs when the Guest session is disposed or fails, including when the Guest receives a
	 * failure notification from the Host.
	 * An idle session with no changes in flight is not stopped.
	 * Closing the Host endpoint without a failure notification does not set this state.
	 *
	 * TODO: add an explicit close message to the protocol to trigger a close event, and set this flag.
	 */
	private stopped = false;

	public constructor(
		/**
		 * The Guest view to synchronize with the Host.
		 */
		private readonly view: TreeViewAlpha<TSchema>,
		/**
		 * Sends a synchronization protocol message to the Host.
		 */
		private readonly send: (message: DataChangeMessage | AcknowledgmentMessage) => void,
		/**
		 * Runs an action within the Guest session's error-handling boundary.
		 */
		private readonly run: (action: () => void) => void,
		/**
		 * Reports an asynchronous synchronization failure to the Guest session.
		 */
		private readonly fail: (error: unknown) => void,
		/**
		 * The scoped logger for synchronization diagnostics.
		 */
		private readonly logger: TelemetryLoggerExt,
	) {
		this.offViewChanged = this.view.events.on("changed", (metadata: ChangeMetadata) => {
			this.run(() => {
				// Only send Guest-authored changes. Sending a change received from the Host back to it
				// would create a synchronization feedback loop.
				if (!metadata.isLocal || this.isApplyingChangesFromHost) {
					return;
				}
				const newChange = metadata.getChange();
				// MessagePort delivery is asynchronous. Validate and send before recording a pending edit.
				this.send({
					type: "dataChange",
					change: newChange,
				});
				this.log(
					`New change [${getRevision(newChange)}] (inFlight:${this.inFlight}->${this.inFlight + 1})`,
				);
				if (this.pushInProgress === undefined) {
					this.log("No pre-existing push in progress. Creating new push promise.");
					this.pushInProgress = makePromiseWithResolvers();
					// Report through the session even when the application does not await synchronization.
					this.pushInProgress.promise.catch((error: unknown) => this.fail(error));
				} else {
					this.log("Reusing existing push promise.");
				}
				this.inFlight += 1;
			});
		});
	}

	/**
	 * Attempts to apply a change from the Host.
	 * The change is ignored if local changes have not yet been reflected on the Host.
	 * The Guest sends an acknowledgment only if it applies the update.
	 */
	public receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// This update does not account for the local changes that the Host has not received.
			// Ignore it. The Host will send another update after it receives the local changes.
			this.log(`Ignoring update from Host (inFlight=${this.inFlight})`);
			return;
		}
		this.isApplyingChangesFromHost = true;
		try {
			this.view.applyChange(change);
		} finally {
			this.isApplyingChangesFromHost = false;
		}
		this.log("Applied update from Host");
		this.send({ type: "acknowledgment" });
	}

	/** Processes the Host's acknowledgment of a local Guest change. */
	public receiveAckFromHost(): void {
		if (this.inFlight <= 0) {
			throw new SandboxProtocolError("Unexpectedly received ack from Host");
		}
		this.log(`Local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			assert(
				this.pushInProgress !== undefined,
				"Missing push promise despite in-flight changes",
			);
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			this.log("All local changes were acked. Resolving push promise.");
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when the Host acknowledges all changes made on the Guest,
	 * or undefined if no such changes are in flight.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}

	/** Stops synchronization and rejects pending work. */
	public stop(error: Error): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.offViewChanged();
		this.pushInProgress?.rejecter(error);
		this.pushInProgress = undefined;
	}

	private log(message: string): void {
		this.logger.sendTelemetryEvent(
			{ eventName: "Synchronization", message },
			undefined,
			LogLevel.verbose,
		);
	}
}
