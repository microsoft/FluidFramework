/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISignalMessage } from "@fluidframework/protocol-definitions";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";

export class LeaderElection {
    private readonly beatInEveryNSecs: number = 1000; // 1 secs
    private readonly leaderWait: number = 30000; // 30 secs
    private lastPinged: number | undefined;
    private readonly logger: TelemetryLogger;
    private prevPing: number | undefined;

    constructor(private readonly dataStoreRuntime: IFluidDataStoreRuntime) {
        this.logger = ChildLogger.create(this.dataStoreRuntime.logger, "SignalLeaderElection");
    }

    public setupLeaderElection() {
        this.dataStoreRuntime.on("signal", (signal: ISignalMessage) => this.handleSignal(signal));
        this.lastPinged = Date.now();
        let interval = setInterval(() => this.runLeaderElection(), this.beatInEveryNSecs);

        this.dataStoreRuntime.once("dispose", () => {
            clearInterval(interval);
        });

        this.dataStoreRuntime.on("disconnected", () => {
            clearInterval(interval);
        });

        this.dataStoreRuntime.on("connected", () => {
            interval = setInterval(() => this.runLeaderElection(), this.beatInEveryNSecs);
        });
    }

    private runLeaderElection() {
        if (this.leaderId !== undefined && this.leaderId === this.dataStoreRuntime.clientId) {
            this.dataStoreRuntime.submitSignal("leaderMessage", "leaderMessage");
            this.updateLastPinged();
        } else if (this.leaderId === undefined) {
            this.logger.sendTelemetryEvent({
                eventName: "LeaderUndefinedEventError",
                testHarnessEvent: true,
            });
        } else {
            const current = Date.now();
            if (this.lastPinged !== undefined && current - this.lastPinged > this.leaderWait) {
                this.logger.sendTelemetryEvent({
                    eventName: "LeaderLostEventError",
                    testHarnessEvent: true,
                });
                this.prevPing = this.lastPinged;
                this.lastPinged = undefined;
            }
        }
    }

    private handleSignal(signal: ISignalMessage) {
        if (signal.clientId !== null && signal.content === "leaderMessage") {
            if (this.leaderId !== signal.clientId) {
                this.logger.sendTelemetryEvent({
                    eventName: "UnexpectedLeaderEventWarning",
                    testHarnessEvent: true,
                });
            }
            this.updateLastPinged();
        }
    }

    private updateLastPinged() {
        this.lastPinged = Date.now();
        if (this.lastPinged === undefined && this.prevPing !== undefined) {
            const time = this.lastPinged - this.prevPing;
            this.logger.sendTelemetryEvent({
                eventName: "LeaderFound",
                time,
                testHarnessEvent: true,
            });
        }
    }

    private get leaderId() {
        return Array.from(this.dataStoreRuntime.getAudience().getMembers().keys()).sort()[0];
    }
}
