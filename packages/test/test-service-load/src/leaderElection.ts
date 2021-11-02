/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISignalMessage } from "@fluidframework/protocol-definitions";

export class LeaderElection {
    private readonly beatInEveryNSecs: number = 1000; // 1 secs
    private readonly leaderWait: number = 5000; // 5 secs
    private lastPinged: Date | undefined;

    constructor(private readonly dataStoreRuntime: IFluidDataStoreRuntime) { }

    public setupLeaderElection() {
        this.dataStoreRuntime.on("signal", (signal: ISignalMessage) => this.handleSignal(signal));

        const interval = setInterval(() => {
            if (this.leaderId !== undefined && this.leaderId === this.dataStoreRuntime.clientId) {
                this.dataStoreRuntime.submitSignal("leaderMessage", "leaderMessage");
                this.lastPinged = new Date();
            }else if(this.leaderId === undefined) {
                this.dataStoreRuntime.logger.send(
                    {
                        category: "performance",
                        eventName: "LeaderElection:Error",
                        warning: "Leader is undefined.",
                        leaderId: this.leaderId,
                        clientId: this.dataStoreRuntime.clientId,
                    });
            }else {
                const current = new Date();
                if(this.lastPinged === undefined || current.getTime() - this.lastPinged?.getTime() > this.leaderWait) {
                    this.dataStoreRuntime.logger.send(
                        {
                            category: "performance",
                            eventName: "LeaderElection:Error",
                            warning: "Did not recieve leader message.",
                            leaderId: this.leaderId,
                            clientId: this.dataStoreRuntime.clientId,
                        });
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
                this.dataStoreRuntime.logger.send(
                    {
                        category: "performance",
                        eventName: "LeaderElection:Error",
                        reason: "Recieved unexpected leader id.",
                        clientId: this.dataStoreRuntime.clientId,
                        newLeaderId: signal.clientId,
                        oldLeaderId: this.leaderId,
                    });
            }
            this.lastPinged = new Date();
        }
    }

    private get leaderId() {
        return Array.from(this.dataStoreRuntime.getAudience().getMembers().keys()).sort()[0];
    }
}
