/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IClient, ISignalMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidAudienceWithHeartBeat } from "./interfaces";

/**
 * TODO:Tracks the last edit details such as the last edited user details and the last edited timestamp. The last edited
 * details should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 */
export class AudienceWithHeartBeat extends EventEmitter implements IFluidAudienceWithHeartBeat {
    private readonly frequency: number;
    private readonly audienceHeartBeat: Map<string, Date> = new Map();
    private readonly container: IContainer;
    private readonly audience: IAudience ;
    private timer: any = undefined;

    /**
     * Creates a AudienceWithHeartBeat object.
     * @param container - runtime Container.
     * @param frequency - heartbeat frequency in milliseconds.
     */
    constructor(container: IContainer, audience: IAudience, frequency: number = 30000) {
        super();
        audience.getMembers().forEach((client: IClient, clientId: string) => {
            this.audienceHeartBeat.set(clientId, new Date());
        });

        this.frequency = frequency;
        this.container = container;
        this.audience = audience;
    }

    public get IFluidAudienceWithHeartBeat() {
        return this;
    }

    /**
     * {@inheritDoc (IFluidAudienceWithHeartBeat:interface).enableHeartBeat}
     */
    public enableHeartBeat() {
        this.timer = setInterval(() => {
            this.container.deltaManager.submitSignal("ping");
            this.validateAudienceHeartBeat();
        }, this.frequency);

        // Listen for heartbeats
        this.container.deltaManager.on("signal", (msg: ISignalMessage) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (this.timer !== undefined && msg.clientId && msg.content === "ping") {
                this.audienceHeartBeat.set(msg.clientId, new Date());

                // client missed addMember event.
                if (this.audience.getMember(msg.clientId) === undefined) {
                    this.emit(MessageType.ClientJoin, this.audience.getMember(msg.clientId));
                }
            }
        });

        // Listen for client join
        this.audience.on("addMember", (clientId: string, client: IClient) => {
            if (this.timer !== undefined && clientId) {
                this.audienceHeartBeat.set(clientId, new Date());
            }
        });

        // Listen for client leave
        this.audience.on("removeMember", (clientId: string, client: IClient) => {
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
        this.audienceHeartBeat.forEach((lastPingReceivedAt: Date, clientId: string) => {
            const diff = new Date().valueOf() - lastPingReceivedAt.valueOf();
            if (diff > this.frequency * 5) {
                // client Lost, missed removeMember event.
                this.emit(MessageType.ClientLeave, this.audience.getMember(clientId));
                this.audienceHeartBeat.delete(clientId);
            }
        });
    }
}
