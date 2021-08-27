/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { SummarizerStopReason } from "./summarizerTypes";

/**
 * Start result indicating that the start was successful.
 */
export interface IStartedResult {
    started: true;
    clientId: string;
}

/**
 * Start result indicating that the start was not successful.
 */
export interface INotStartedResult {
    started: false;
    message: "DisconnectedBeforeRun" | "NeverConnectedBeforeRun";
}

export interface IConnectableRuntime {
    readonly connected: boolean;
    readonly clientId: string | undefined;
    once(event: "connected", listener: () => void): this;
    on(event: "disconnected", listener: () => void): this;
}

/**
 * Helper class to coordinate something that needs to run only while connected.
 * This provides promises that resolve as it starts or stops.  Stopping happens
 * when disconnected or if stop() is called.
 */
export class RunWhileConnectedCoordinator {
    private everConnected = false;
    private readonly stopDeferred = new Deferred<void>();

    public constructor(private readonly runtime: IConnectableRuntime) {
        // Try to determine if the runtime has ever been connected
        if (this.runtime.connected) {
            this.everConnected = true;
        } else {
            this.runtime.once("connected", () => this.everConnected = true);
        }
        this.runtime.on("disconnected", () => {
            // Sometimes the initial connection state is raised as disconnected
            if (!this.everConnected) {
                return;
            }
            this.stop();
        });
    }

    /**
     * Starts and waits for a promise which resolves when connected.
     * The promise will also resolve if stopped either externally or by disconnect.
     * The return value indicates whether the start is successful or not.
     */
    public async waitStart(): Promise<IStartedResult | INotStartedResult> {
        if (!this.runtime.connected) {
            if (this.everConnected) {
                // We will not try to reconnect, so we are done running
                return { started: false, message: "DisconnectedBeforeRun" };
            }
            const waitConnected = new Promise<void>((resolve) =>
                this.runtime.once("connected", resolve));
            await Promise.race([waitConnected, this.stopDeferred.promise]);
            if (!this.runtime.connected) {
                // If still not connected, no need to start running
                return { started: false, message: "NeverConnectedBeforeRun" };
            }
        }

        if (this.runtime.clientId === undefined) {
            throw Error("clientId should be defined if connected.");
        }
        return { started: true, clientId: this.runtime.clientId };
    }

    /**
     * Returns a promise that resolves once stopped either externally or by disconnect.
     */
    public async waitStopped(): Promise<void> {
        return this.stopDeferred.promise;
    }

    /**
     * Stops running.
     */
    public stop(reason?: SummarizerStopReason): void {
        this.stopDeferred.resolve();
    }
}
