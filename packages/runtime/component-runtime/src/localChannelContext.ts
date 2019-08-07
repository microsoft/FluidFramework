/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@prague/container-definitions";
import {
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@prague/protocol-definitions";
import {
    IChannel,
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import * as assert from "assert";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";

/**
 * Channel context for a locally created channel
 */
export class LocalChannelContext implements IChannelContext {
    public readonly channel: IChannel;
    private attached = false;
    private connection: ChannelDeltaConnection;
    private baseId: string;

    constructor(
        id: string,
        registry: ISharedObjectRegistry,
        type: string,
        runtime: IComponentRuntime,
        private readonly componentContext: IComponentContext,
        private readonly storageService: IDocumentStorageService,
        private readonly submitFn: (type: MessageType, content: any) => number,
    ) {
        const factory = registry.get(type);
        if (!factory) {
            throw new Error(`Channel Factory ${type} not registered`);
        }

        this.channel = factory.create(runtime, id);
    }

    public async getChannel(): Promise<IChannel> {
        return this.channel;
    }

    public isRegistered(): boolean {
        return this.channel.isRegistered();
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        // Connection events are ignored if the component is not yet attached
        if (!this.attached) {
            return;
        }

        this.connection.setConnectionState(value);
    }

    public async prepareOp(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        assert(this.attached);
        return this.connection.prepare(message, local);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        assert(this.attached);

        // Clear base id since the channel is now dirty
        this.baseId = null;
        this.connection.process(message, local, context);
    }

    public async snapshot(): Promise<ITree> {
        return this.getAttachSnapshot();
    }

    public getAttachSnapshot(): ITree {
        return snapshotChannel(this.channel, this.baseId);
    }

    public attach(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        const services = createServiceEndpoints(
            this.channel.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.storageService,
            undefined);
        this.connection = services.deltaConnection;
        this.channel.connect(services);

        this.attached = true;
    }
}
