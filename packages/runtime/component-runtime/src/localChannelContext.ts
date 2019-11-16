/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-container-definitions";
import { SummaryTracker } from "@microsoft/fluid-core-utils";
import {
    ConnectionState,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IChannel, IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
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
    private connection: ChannelDeltaConnection | undefined;
    private readonly summaryTracker = new SummaryTracker();

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

        // tslint:disable-next-line: no-non-null-assertion
        this.connection!.setConnectionState(value);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean): void {
        assert(this.attached);
        this.summaryTracker.invalidate();

        // tslint:disable-next-line: no-non-null-assertion
        this.connection!.process(message, local);
    }

    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        const baseId = this.summaryTracker.getBaseId();
        if (baseId !== null && !fullTree) {
            return { id: baseId, entries: [] };
        }
        this.summaryTracker.reset();

        return this.getAttachSnapshot();
    }

    public getAttachSnapshot(): ITree {
        return snapshotChannel(this.channel, this.summaryTracker.getBaseId());
    }

    public attach(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        const services = createServiceEndpoints(
            this.channel.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.storageService);
        this.connection = services.deltaConnection;
        this.channel.connect(services);

        this.attached = true;
    }

    public refreshBaseSummary(snapshot: ISnapshotTree) {
        this.summaryTracker.setBaseTree(snapshot);
    }
}
