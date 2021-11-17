/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IClient, MessageType } from "@fluidframework/protocol-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidAudienceWithHeartBeat } from "./interfaces";

/**
 * This class wraps implements heart-beat over Audience and emits event
 * in case we are not listening from any client for 5 continuous heart-beats
 * or we started getting heart-beat from a client who is not present in Audience.
 */
export class AudienceWithHeartBeat extends EventEmitter implements IFluidAudienceWithHeartBeat {
    private readonly audienceHeartBeat: Map<string, number> = new Map();
    private timer: any = undefined;

    /**
     * Creates a AudienceWithHeartBeat object.
     * @param runtime - IFluidDataStoreRuntime.
     * @param frequency - heartbeat frequency in milliseconds.
     */
    constructor(private readonly runtime: IFluidDataStoreRuntime,
        private readonly frequency: number = 30000) {
        super();

        this.runtime.getAudience().getMembers().forEach((client: IClient, clientId: string) => {
            this.audienceHeartBeat.set(clientId, Date.now());
        });
    }

    public get IFluidAudienceWithHeartBeat() {
        return this;
    }

    /**
     * {@inheritDoc (IFluidAudienceWithHeartBeat:interface).enableHeartBeat}
     */
    public enableHeartBeat() {
        this.timer = setInterval(() => {
            this.runtime.submitSignal("ping", this.runtime.getAudience().getMember(this.runtime.clientId as string));
            this.validateAudienceHeartBeat();
        }, this.frequency);

        // Listen for heartbeats
        this.runtime.on("signal", (message: IInboundSignalMessage) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (this.timer !== undefined && message.clientId && message.type === "ping") {
                this.audienceHeartBeat.set(message.clientId, Date.now());

                // client missed addMember event.
                if (this.runtime.getAudience().getMember(message.clientId) === undefined) {
                    this.emit(MessageType.ClientJoin, message.content as IClient);
                }
            }
        });

        // Listen for client join
        this.runtime.getAudience().on("addMember", (clientId: string, client: IClient) => {
            if (this.timer !== undefined && clientId) {
                this.audienceHeartBeat.set(clientId, Date.now());
            }
        });

        // Listen for client leave
        this.runtime.getAudience().on("removeMember", (clientId: string, client: IClient) => {
            if (this.timer !== undefined && clientId) {
                this.audienceHeartBeat.delete(clientId);
            }
        });
    }

    /**
     * {@inheritDoc (IFluidAudienceWithHeartBeat:interface).disableHeartBeat}
     */
    public disableHeartBeat() {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private validateAudienceHeartBeat() {
        this.audienceHeartBeat.forEach((lastPingReceivedAt: number, clientId: string) => {
            const diff = Date.now() - lastPingReceivedAt;
            if (diff > this.frequency * 5) {
                // client Lost, missed removeMember event.
                this.emit(MessageType.ClientLeave, clientId);
                this.audienceHeartBeat.delete(clientId);
            }
        });
    }
}
