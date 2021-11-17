/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IClient, MessageType } from "@fluidframework/protocol-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { AudienceWithHeartBeat } from "@fluid-experimental/audience-heartbeat";

export class AudienceWithHeartBeat {
    private readonly frequency: number = 30000; // 30 secs
    private readonly threshold: number = 5 * this.frequency; // 5 times of frequency
    private readonly audienceHeartBeat: Map<string, number> = new Map();
    private readonly logger: TelemetryLogger;

    constructor(private readonly runtime: IFluidDataStoreRuntime, frequency: number = 30000) {
        this.logger = ChildLogger.create(this.runtime.logger, "SignalAudienceWithHeartBeat");
    }

    public setupAudienceWithHeartBeat() {
        this.runtime.getAudience().getMembers().forEach((client: IClient, clientId: string) => {
            this.audienceHeartBeat.set(clientId, Date.now());
        });

        this.runtime.on("signal", (message: IInboundSignalMessage) => this.handleSignal(message));
        let interval = setInterval(() => this.runAudienceWithHeartBeat(), this.frequency);

        this.runtime.once("dispose", () => {
            clearInterval(interval);
        });

        this.runtime.on("disconnected", () => {
            clearInterval(interval);
        });

        this.runtime.on("connected", () => {
            interval = setInterval(() => this.runAudienceWithHeartBeat(), this.frequency);
        });
    }

    private runAudienceWithHeartBeat() {
        if (this.leaderId !== undefined && this.leaderId === this.runtime.clientId) {
            this.runtime.submitSignal("leaderMessage", "leaderMessage");
            // this.lastPinged = Date.now();
        }else if(this.leaderId === undefined) {
            this.logger.sendErrorEvent({eventName: "LeaderUndefinedEventError"});
        }else {
            const current = Date.now();
            // if(this.lastPinged !== undefined && current - this.lastPinged > this.threshold) {
            //     this.logger.sendErrorEvent({eventName: "LeaderLostEventError"});
            //     this.lastPinged = undefined;
            // }
        }
    }

    private handleSignal(message: IInboundSignalMessage) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (message.clientId && message.type === "ping") {
            this.audienceHeartBeat.set(message.clientId, Date.now());

            if (this.runtime.getAudience().getMember(message.clientId) === undefined) {
                this.logger.sendErrorEvent({eventName: "ClientJoinedButAudienceNotUpdatedError"});
            }
        }
    }

    private get leaderId() {
        return Array.from(this.runtime.getAudience().getMembers().keys()).sort()[0];
    }
}
