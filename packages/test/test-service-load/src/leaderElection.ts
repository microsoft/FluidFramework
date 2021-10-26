/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import { ISignalMessage } from "@fluidframework/protocol-definitions";

export class LeaderElection {
    private readonly container: Container;
    private leaderId: string | undefined;
    private readonly beatInEveryNSecs: number = 5000; // 5 secs
    private readonly leaderWait: number = 10000; // 10 secs
    private lastPinged: Date | undefined;

    constructor(container: Container) {
        this.container = container;
    }

    public setupLeaderElection() {
        this.container.on("signal", (signal: ISignalMessage) => this.handleSignal(signal));
        this.container.audience.on("removeMember", (clientId) => {
            if(clientId === this.leaderId) {
                this.electNewLeader();
            }
        });

        setInterval(() => {
            if (this.leaderId === this.container.clientId) {
                this.container.deltaManager.submitSignal({event: "leaderMessage", isLeader: true});
                this.lastPinged = new Date();
                console.log(`Leader with client id: ${this.leaderId} sending ping at ${Date.now}.`);
            }else if(this.leaderId === undefined) {
                this.electNewLeader();
            }else {
                const current = new Date();
                if(this.lastPinged === undefined || current.getTime() - this.lastPinged?.getTime() > this.leaderWait) {
                    this.electNewLeader();
                }
            }
        }, this.beatInEveryNSecs);
    }

    private handleSignal(signal: ISignalMessage) {
        // eslint-disable-next-line no-null/no-null
        if(signal.clientId !== null && signal.content.event === "leaderMessage") {
            if(signal.content.isLeader as boolean) {
                console.log(`Client id: ${this.container.clientId} 
                    recieving ping at ${Date.now} 
                    from ${signal.clientId} 
                    expecting leader ${this.leaderId}.`);
                this.leaderId = signal.clientId;
                this.lastPinged = new Date();
            }else{
                this.leaderId = undefined;
            }
        }
    }

    private electNewLeader() {
        let newLeaderId = this.container.clientId;
        this.container.audience.getMembers().forEach((member) => {
            if(newLeaderId === undefined || newLeaderId > member.user.id) {
                newLeaderId = member.user.id;
            }
        });
        this.leaderId = newLeaderId;
        console.log(`New leader: ${this.leaderId}`);
    }
}
