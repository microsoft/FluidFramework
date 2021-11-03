/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISignalMessage } from "@fluidframework/protocol-definitions";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";

export class LeaderElection {
    private readonly beatInEveryNSecs: number = 1000; // 1 secs
    private readonly leaderWait: number = 5000; // 5 secs
    private lastPinged: number | undefined;
    private readonly logger: TelemetryLogger;

    constructor(private readonly dataStoreRuntime: IFluidDataStoreRuntime) {
        this.logger = ChildLogger.create(this.dataStoreRuntime.logger, "SignalLeaderElection");
     }

    public setupLeaderElection() {
        this.dataStoreRuntime.on("signal", (signal: ISignalMessage) => this.handleSignal(signal));
        this.lastPinged = Date.now();
        const interval = setInterval(() => {
            if (this.leaderId !== undefined && this.leaderId === this.dataStoreRuntime.clientId) {
                this.dataStoreRuntime.submitSignal("leaderMessage", "leaderMessage");
                this.lastPinged = Date.now();
            }else if(this.leaderId === undefined) {
                this.logger.sendErrorEvent({eventName: "LeaderUndefinedEventError"});
            }else {
                const current = Date.now();
                if(this.lastPinged !== undefined && current - this.lastPinged > this.leaderWait) {
                    this.logger.sendErrorEvent({eventName: "LeaderLostEventError"});
                    this.lastPinged = undefined;
                }
            }
        }, this.beatInEveryNSecs);

        this.dataStoreRuntime.once("dispose", () => {
            clearInterval(interval);
        });

        this.dataStoreRuntime.on("disconnected", () => {
            clearInterval(interval);
        });
    }

    private handleSignal(signal: ISignalMessage) {
        // eslint-disable-next-line no-null/no-null
        if(signal.clientId !== null && signal.content === "leaderMessage") {
            if(this.leaderId !== signal.clientId) {
                this.logger.sendErrorEvent({eventName: "UnexpectedLeaderEventError"});
            }
            this.lastPinged = Date.now();
        }
    }

    private get leaderId() {
        return Array.from(this.dataStoreRuntime.getAudience().getMembers().keys()).sort()[0];
    }
}
