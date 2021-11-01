/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISignalMessage } from "@fluidframework/protocol-definitions";

export class LeaderElection {
    private readonly dataStoreRuntime: IFluidDataStoreRuntime;
    private readonly clientId: string | undefined;
    private readonly logger: ITelemetryBaseLogger;
    private leaderId: string | undefined;
    private readonly beatInEveryNSecs: number = 1000; // 1 secs
    private readonly leaderWait: number = 5000; // 5 secs
    private lastPinged: Date | undefined;

    constructor(dataStoreRuntime: IFluidDataStoreRuntime,
        clientId: string | undefined,
        logger: ITelemetryBaseLogger) {
        this.dataStoreRuntime = dataStoreRuntime;
        this.clientId = clientId;
        this.logger = logger;
    }

    public setupLeaderElection() {
        this.electNewLeader("Initializing leader election.");
        this.dataStoreRuntime.on("signal", (signal: ISignalMessage) => this.handleSignal(signal));
        this.dataStoreRuntime.getAudience().on("removeMember", (clientId) => {
            if(clientId === this.leaderId) {
                this.electNewLeader("Leader was removed from the audience.");
            }
        });

        const interval = setInterval(() => {
            if (this.leaderId !== undefined && this.leaderId === this.clientId) {
                this.dataStoreRuntime.submitSignal("leaderMessage", "leaderMessage");
                this.lastPinged = new Date();
                console.log(`Leader with client id: ${this.leaderId} sending ping at ${Date.now()}.`);
                this.logger.send(
                    {
                        category: "performance",
                        eventName: "LeaderElection:PingSent",
                        leaderId: this.leaderId,
                        time: Date.now(),
                    });
            }else if(this.leaderId === undefined) {
                this.electNewLeader("Leader is undefined.");
            }else {
                const current = new Date();
                if(this.lastPinged === undefined || current.getTime() - this.lastPinged?.getTime() > this.leaderWait) {
                    this.electNewLeader("Not recieving leader messages.");
                }
            }
        }, this.beatInEveryNSecs);

        this.dataStoreRuntime.once("dispose", () => {
            clearInterval(interval);
        });
    }

    private handleSignal(signal: ISignalMessage) {
        // eslint-disable-next-line no-null/no-null
        if(signal.clientId !== null && signal.content === "leaderMessage") {
            if(this.leaderId === signal.clientId) {
                console.log(`Expected leader message recieved: ${this.leaderId} 
                at client ${this.clientId}`);
            }else{
                console.log(`Client id: ${this.clientId}
                recieving ping at ${Date.now()}
                from ${signal.clientId}
                expecting leader ${this.leaderId}.`);
                this.logger.send(
                    {
                        category: "performance",
                        eventName: "LeaderElection:ElectNewLeader",
                        reason: "Recieved unexpected leader id.",
                        clientId: this.clientId,
                        newLeaderId: signal.clientId,
                        oldLeaderId: this.leaderId,
                    });
                this.leaderId = signal.clientId;
            }
            this.lastPinged = new Date();
        }
    }

    private electNewLeader(reason: string) {
        let newLeaderId = this.clientId;
        this.dataStoreRuntime.getAudience().getMembers().forEach((member) => {
            if(newLeaderId === undefined || newLeaderId > member.user.id) {
                newLeaderId = member.user.id;
            }
        });
        const oldLeaderId = this.leaderId;
        this.leaderId = newLeaderId;
        console.log(`New leader elected: ${this.leaderId}, 
        reason: ${reason} 
        for client: ${this.clientId}`);
        this.logger.send(
            {
                category: "performance",
                eventName: "LeaderElection:ElectNewLeader",
                reason,
                clientId: this.clientId,
                newLeaderId: this.leaderId,
                oldLeaderId,
            });
    }
}
