/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionState,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IChannel, IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";

/**
 * Channel context for a locally created channel
 */
export class LocalChannelContext implements IChannelContext {
    public readonly channel: IChannel;
    private attached = false;
    private connection: ChannelDeltaConnection | undefined;
    private readonly dirtyFn: () => void;

    constructor(
        id: string,
        registry: ISharedObjectRegistry,
        type: string,
        runtime: IComponentRuntime,
        private readonly componentContext: IComponentContext,
        private readonly storageService: IDocumentStorageService,
        private readonly submitFn: (type: MessageType, content: any) => number,
        dirtyFn: (address: string) => void,
    ) {
        const factory = registry.get(type);
        if (factory === undefined) {
            throw new Error(`Channel Factory ${type} not registered`);
        }

        this.channel = factory.create(runtime, id);

        this.dirtyFn = () => { dirtyFn(id); };
    }

    public async getChannel(): Promise<IChannel> {
        return this.channel;
    }

    public isRegistered(): boolean {
        return this.channel.isRegistered();
    }

    public changeConnectionState(value: ConnectionState, clientId?: string) {
        // Connection events are ignored if the component is not yet attached
        if (!this.attached) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection!.setConnectionState(value);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean): void {
        assert(this.attached);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection!.process(message, local);
    }

    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        return this.getAttachSnapshot();
    }

    public getAttachSnapshot(): ITree {
        return snapshotChannel(this.channel);
    }

    public attach(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        const services = createServiceEndpoints(
            this.channel.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.dirtyFn,
            this.storageService);
        this.connection = services.deltaConnection;
        this.channel.connect(services);

        this.attached = true;
    }
}
