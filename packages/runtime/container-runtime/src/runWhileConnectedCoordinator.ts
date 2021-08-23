/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred, assert } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { SummarizerStopReason, IConnectableRuntime, ICancellable } from "./summarizerTypes";

/* Similar to AbortController, but using promise instead of events */
export interface ICancellableSummarizerController extends ICancellable {
    stop(reason: SummarizerStopReason): void;
}

/**
 * Helper class to coordinate something that needs to run only while connected.
 * This provides promises that resolve as it starts or stops.  Stopping happens
 * when disconnected or if stop() is called.
 */
export class RunWhileConnectedCoordinator implements ICancellableSummarizerController {
    private everConnected = false;
    private _cancelled = false;
    private readonly stopDeferred = new Deferred<void>();

    public get cancelled() {
        if (!this._cancelled) {
            assert(this.runtime.deltaManager.active, "We should never connect as 'read'");

            // This check can't be enabled in current design due to lastSummary flow, where
            // summarizer for closed container stays around and can produce one more summary.
            // Currently we solve the problem of overlapping summarizer by doing wait in
            // SummaryManager.createSummarizer()
            // Better solution would involve these steps:
            // 1. Summarizer selection logic should chose summarizing client (with clientType === "summarizer")
            // if such client exists.
            // 2. Summarizer should be updated about such changes (to update onBehalfOfClientId)
            //
            // assert(this.runtime.summarizerClientId === this.onBehalfOfClientId ||
            //    this.runtime.summarizerClientId === this.runtime.clientId, "onBehalfOfClientId");
        }

        return this._cancelled;
    }

    /**
     * Returns a promise that resolves once stopped either externally or by disconnect.
     */
     public get waitCancelled(): Promise<void> {
        return this.stopDeferred.promise;
    }

    public constructor(
        private readonly runtime: IConnectableRuntime,
        /** clientId of parent (non-summarizing) container that owns summarizer container */
        private readonly onBehalfOfClientId: string,
        private readonly logger: ITelemetryLogger) {
        // Try to determine if the runtime has ever been connected
        if (this.runtime.connected) {
            this.everConnected = true;
        } else if (this.runtime.disposed) {
            this.stop("summarizeClientDisconnected");
        }
        else {
            this.runtime.once("connected", () => this.everConnected = true);
        }
        // We only listen on disconnected event for clientType === "summarizer" container!
        // And only do it here - no other place should check it! That way we have only one place
        // that controls policy and it's easy to change policy in the future if we want to!
        // We do not listen for "main" (aka interactive) container disconnect here, as it's
        // responsibility of SummaryManager to decide if that's material or not. There are cases
        // like "lastSummary", or main client experiencing nacks / disconnects due to hitting limit
        // of non-summarized ops, where can make determination to continue with summary even if main
        // client is disconnected.
        this.runtime.once("disconnected", () => {
            // Sometimes the initial connection state is raised as disconnected
            if (!this.everConnected) {
                return;
            }
            this.stop("summarizeClientDisconnected");
        });

        // Initialize values and first ack (time is not exact)
        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOfClientId,
            initSummarySeqNumber: this.runtime.deltaManager.initialSequenceNumber,
        });
    }

    /**
     * Starts and waits for a promise which resolves when connected.
     * The promise will also resolve if stopped either externally or by disconnect.
     * The return value indicates whether the start is successful or not.
     */
    public async waitStart() {
        if (!this.runtime.connected) {
            if (this.everConnected) {
                // We will not try to reconnect, so we are done running
                return { started: false, message: "DisconnectedBeforeRun" };
            }
            const waitConnected = new Promise<void>((resolve) =>
                this.runtime.once("connected", resolve));
            await Promise.race([waitConnected, this.waitCancelled]);
        }
    }

    /**
     * Stops running.
     */
    public stop(reason: SummarizerStopReason): void {
        if (!this._cancelled) {
            this._cancelled = true;
            this.logger.sendTelemetryEvent({
                eventName: "StoppingSummarizer",
                onBehalfOf: this.onBehalfOfClientId,
                reason,
            });

            this.stopDeferred.resolve();
        }
    }
}
