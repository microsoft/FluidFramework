/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Container } from "@fluidframework/container-loader";
import { IClient, ISignalMessage } from "@fluidframework/protocol-definitions";
import { IFluidAudienceWithHeartBeat } from "./interfaces";

/**
 * TODO:Tracks the last edit details such as the last edited user details and the last edited timestamp. The last edited
 * details should be updated (via updateLastEditDetails) in response to a remote op since it uses shared summary block
 * as storage.
 */
export class AudienceWithHeartBeat implements IFluidAudienceWithHeartBeat {
    private readonly frequency: number;
    private readonly audienceHeartBeat: Map<string, Date> = new Map();
    private readonly container: Container;
    private timer: any = undefined;

    /**
     * Creates a AudienceWithHeartBeat object.
     * @param container - runtime Container.
     * @param frequency - heartbeat frequency in milliseconds.
     */
    constructor(container: Container, frequency: number = 30000) {
        container.audience.getMembers().forEach((client: IClient, clientId: string) => {
            this.audienceHeartBeat.set(clientId, new Date());
        });

        this.frequency = frequency;
        this.container = container;
    }

    public get IFluidAudienceWithHeartBeat() {
        return this;
    }

    /**
     * {@inheritDoc (IFluidAudienceWithHeartBeat:interface).enableHeartBeat}
     */
    public enableHeartBeat() {
        this.timer = setInterval(() => {
            this.container.deltaManager.submitSignal({event: "ping", client: this.container.clientId});
            this.validateAudienceHeartBeat();
        }, this.frequency);

        // Listen for heartbeats
        this.container.deltaManager.on("signal", (msg: ISignalMessage) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (this.timer !== undefined && msg.clientId && msg.content.event === "ping") {
                this.audienceHeartBeat.set(msg.clientId, new Date());

                // client missed addMember event.
                if (this.container.audience.getMember(msg.clientId) === undefined) {
                    this.container.audience.addMember(msg.clientId, msg.content.client);
                }
            }
        });

        // Listen for client join
        this.container.audience.on("addMember", (clientId: string, client: IClient) => {
            if (this.timer !== undefined && clientId) {
                this.audienceHeartBeat.set(clientId, new Date());
            }
        });

        // Listen for client leave
        this.container.audience.on("removeMember", (clientId: string, client: IClient) => {
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
                this.container.audience.removeMember(clientId);
                this.audienceHeartBeat.delete(clientId);
            }
        });
    }
}
