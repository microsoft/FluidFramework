/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readAndParse, CreateContainerError } from "@fluidframework/driver-utils";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IChannelAttributes,
    IComponentRuntime,
} from "@fluidframework/component-runtime-definitions";
import {
    IComponentContext,
    ISummaryTracker,
} from "@fluidframework/runtime-definitions";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";
import { debug } from "./debug";
import { ChannelStorageService } from "./channelStorageService";

export class RemoteChannelContext implements IChannelContext {
    private isLoaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
    private channelP: Promise<IChannel> | undefined;
    private channel: IChannel | undefined;
    private readonly services: {
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    };
    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly componentContext: IComponentContext,
        storageService: IDocumentStorageService,
        submitFn: (type: MessageType, content: any, localOpMetadata: unknown) => number,
        dirtyFn: (address: string) => void,
        private readonly id: string,
        baseSnapshot: Promise<ISnapshotTree> | ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Promise<Map<string, string>> | undefined,
        private readonly branch: string,
        private readonly summaryTracker: ISummaryTracker,
        private readonly attachMessageType?: string,
    ) {
        this.services = createServiceEndpoints(
            this.id,
            this.componentContext.connected,
            submitFn,
            () => dirtyFn(this.id),
            storageService,
            Promise.resolve(baseSnapshot),
            extraBlobs);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getChannel(): Promise<IChannel> {
        if (this.channelP === undefined) {
            this.channelP = this.loadChannel();
        }

        return this.channelP;
    }

    public isRegistered(): boolean {
        // A remote channel by definition is registered
        return true;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        // Connection events are ignored if the component is not yet loaded
        if (!this.isLoaded) {
            return;
        }

        this.services.deltaConnection.setConnectionState(connected);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);

        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(!local);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded);

        this.services.deltaConnection.reSubmit(content, localOpMetadata);
    }

    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }

        const channel = await this.getChannel();
        return snapshotChannel(channel);
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded);

        let attributes: IChannelAttributes | undefined;
        if (await this.services.objectStorage.contains(".attributes")) {
            attributes = await readAndParse<IChannelAttributes | undefined>(
                this.services.objectStorage,
                ".attributes");
        }

        let factory: ISharedObjectFactory | undefined;
        // this is a back-compat case where
        // the attach message doesn't include
        // the attributes. Since old attach messages
        // will not have attributes we need to keep
        // this as long as we support old attach messages
        if (attributes === undefined) {
            if (this.attachMessageType === undefined) {
                throw new Error("Channel type not available");
            }
            factory = this.registry.get(this.attachMessageType);
            if (factory === undefined) {
                throw new Error(`Channel Factory ${this.attachMessageType} for attach not registered`);
            }
            attributes = factory.attributes;
        } else {
            factory = this.registry.get(attributes.type);
            if (factory === undefined) {
                throw new Error(`Channel Factory ${attributes.type} not registered`);
            }
        }

        // Compare snapshot version to collaborative object version
        if (attributes.snapshotFormatVersion !== undefined
            && attributes.snapshotFormatVersion !== factory.attributes.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${attributes.type}, ` +
                `Snapshot format@pkg version: ${attributes.snapshotFormatVersion}@${attributes.packageVersion}, ` +
                // eslint-disable-next-line max-len
                `client format@pkg version: ${factory.attributes.snapshotFormatVersion}@${factory.attributes.packageVersion}`);
        }

        // eslint-disable-next-line max-len
        debug(`Loading channel ${attributes.type}@${factory.attributes.packageVersion}, snapshot format version: ${attributes.snapshotFormatVersion}`);

        const channel = await factory.load(
            this.runtime,
            this.id,
            this.services,
            this.branch,
            attributes);

        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending!) {
            try {
                this.services.deltaConnection.process(message, false, undefined /* localOpMetadata */);
            } catch (err) {
                // record sequence number for easier debugging
                const error = CreateContainerError(err);
                error.sequenceNumber = message.sequenceNumber;
                throw error;
            }
        }

        // Commit changes.
        this.channel = channel;
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.services.deltaConnection.setConnectionState(this.componentContext.connected);
        return this.channel;
    }
}
