/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/common-utils";
import { SummarizerStopReason, IConnectableRuntime, ISummaryCancellationToken } from "./summarizerTypes";

/* Similar to AbortController, but using promise instead of events */
export interface ICancellableSummarizerController extends ISummaryCancellationToken {
    stop(reason: SummarizerStopReason): void;
}

/**
 * Can be useful in testing as well as in places where caller does not use cancellation.
 * This object implements ISummaryCancellationToken interface but cancellation is never leveraged.
 */
export const neverCancelledSummaryToken: ISummaryCancellationToken = {
    cancelled: false,
    waitCancelled: new Promise(() => {}),
};

/**
 * Helper class to coordinate something that needs to run only while connected.
 * This provides promises that resolve as it starts or stops.  Stopping happens
 * when disconnected or if stop() is called.
 */
export class RunWhileConnectedCoordinator implements ICancellableSummarizerController {
    private everConnected = false;
    private _cancelled = false;
    private readonly stopDeferred = new Deferred<SummarizerStopReason>();

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
     public get waitCancelled(): Promise<SummarizerStopReason> {
        return this.stopDeferred.promise;
    }

    public static async create(runtime: IConnectableRuntime) {
        const obj = new RunWhileConnectedCoordinator(runtime);
        await obj.waitStart();
        return obj;
    }

    protected constructor(private readonly runtime: IConnectableRuntime) {
        // Try to determine if the runtime has ever been connected
        if (this.runtime.connected) {
            this.everConnected = true;
        } else if (this.runtime.disposed) {
            this.stop("summarizerClientDisconnected");
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
            this.stop("summarizerClientDisconnected");
        });
    }

    /**
     * Starts and waits for a promise which resolves when connected.
     * The promise will also resolve if stopped either externally or by disconnect.
     */
    public async waitStart() {
        if (!this.runtime.connected && !this.everConnected) {
            const waitConnected = new Promise<void>((resolve) =>
                this.runtime.once("connected", resolve));
            return Promise.race([waitConnected, this.waitCancelled]);
        }
    }

    /**
     * Stops running.
     */
    public stop(reason: SummarizerStopReason): void {
        if (!this._cancelled) {
            this._cancelled = true;
            this.stopDeferred.resolve(reason);
        }
    }
}
