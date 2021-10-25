/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalMessage, MessageType, ISignalClient } from "@fluidframework/protocol-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { Loader } from "./loader";
import { Container, IContainerConfig} from "./container";

/**
 * This class wraps the actual storage and make sure no wrong apis are called according to
 * container attach state.
 */
export class ContainerWithHeartBeat extends Container {
    private readonly beatInEveryNSecs: number = 30000; // 30 secs
    // eslint-disable-next-line @typescript-eslint/prefer-readonly
    private audienceHeartBeat: Map<string, Date> = new Map();

    constructor(
        loader: Loader,
        config: IContainerConfig,
    ) {
        super(loader, config);

        this._deltaManager.on("connect", (details: IConnectionDetails, opsBehind?: number) => {
            this.connectionStateHandler.receivedConnectEvent(
                this._deltaManager.connectionMode,
                details,
                opsBehind,
            );

            for (const priorClient of details.initialClients ?? []) {
                this.audienceHeartBeat.set(priorClient.clientId, new Date());
            }

            this.enableHeartBeat();
        });
    }

    private validateAudienceHeartBeat() {
        this.audienceHeartBeat.forEach((lastPingReceivedAt: Date, clientId: string) => {
            const diff = new Date().valueOf() - lastPingReceivedAt.valueOf();
            if (diff > this.beatInEveryNSecs * 5) {
                // client Lost, missed removeMember event.
                this._audience.removeMember(clientId);
                this.audienceHeartBeat.delete(clientId);
            }
        });
    }

    private enableHeartBeat() {
        setInterval(() => {
            this._deltaManager.submitSignal({event: "ping", client: this.client});
            this.validateAudienceHeartBeat();
        }, this.beatInEveryNSecs);

        // Listen for heartbeats
        this._deltaManager.on("signal", (msg: ISignalMessage) => {
            if (msg.clientId !== null && msg.content.event === "ping") {
                this.audienceHeartBeat.set(msg.clientId, new Date());

                // client missed addMember event.
                if (!this._audience.getMember(msg.clientId)) {
                    this._audience.addMember(msg.clientId, msg.content.client);
                }
            }
        });
    }

    protected processSignal(message: ISignalMessage) {
        super.processSignal(message);
        if (message.clientId === null) {
            const innerContent = message.content as { content: any; type: string };
            if (innerContent.type === MessageType.ClientJoin) {
                const newClient = innerContent.content as ISignalClient;
                this.audienceHeartBeat.set(newClient.clientId, new Date());
            } else if (innerContent.type === MessageType.ClientLeave) {
                const leftClientId = innerContent.content as string;
                this.audienceHeartBeat.delete(leftClientId);
            }
        }
    }
}
