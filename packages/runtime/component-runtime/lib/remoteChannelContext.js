/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { CreateContainerError } from "@fluidframework/container-utils";
import { readAndParse } from "@fluidframework/driver-utils";
import { convertToSummaryTree } from "@fluidframework/runtime-utils";
import { createServiceEndpoints, snapshotChannel } from "./channelContext";
import { debug } from "./debug";
export class RemoteChannelContext {
    constructor(runtime, componentContext, storageService, submitFn, dirtyFn, id, baseSnapshot, registry, extraBlobs, branch, summaryTracker, createSummarizerNode, attachMessageType) {
        this.runtime = runtime;
        this.componentContext = componentContext;
        this.id = id;
        this.registry = registry;
        this.branch = branch;
        this.summaryTracker = summaryTracker;
        this.attachMessageType = attachMessageType;
        this.isLoaded = false;
        this.pending = [];
        this.services = createServiceEndpoints(this.id, this.componentContext.connected, submitFn, () => dirtyFn(this.id), storageService, Promise.resolve(baseSnapshot), extraBlobs);
        const thisSummarizeInternal = async (fullTree) => this.summarizeInternal(fullTree);
        this.summarizerNode = createSummarizerNode(thisSummarizeInternal);
    }
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    getChannel() {
        if (this.channelP === undefined) {
            this.channelP = this.loadChannel();
        }
        return this.channelP;
    }
    setConnectionState(connected, clientId) {
        // Connection events are ignored if the component is not yet loaded
        if (!this.isLoaded) {
            return;
        }
        this.services.deltaConnection.setConnectionState(connected);
    }
    processOp(message, local, localOpMetadata) {
        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);
        this.summarizerNode.invalidate(message.sequenceNumber);
        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local, localOpMetadata);
        }
        else {
            assert(!local, "Remote channel must not be local when processing op");
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending.push(message);
        }
    }
    reSubmit(content, localOpMetadata) {
        assert(this.isLoaded, "Remote channel must be loaded when resubmitting op");
        this.services.deltaConnection.reSubmit(content, localOpMetadata);
    }
    async snapshot(fullTree = false) {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }
        const channel = await this.getChannel();
        return snapshotChannel(channel);
    }
    async summarize(fullTree = false) {
        return this.summarizerNode.summarize(fullTree);
    }
    async summarizeInternal(fullTree) {
        const channel = await this.getChannel();
        const snapshotTree = snapshotChannel(channel);
        const summaryResult = convertToSummaryTree(snapshotTree, fullTree);
        return Object.assign(Object.assign({}, summaryResult), { id: this.id });
    }
    async loadChannel() {
        assert(!this.isLoaded, "Remote channel must not already be loaded when loading");
        let attributes;
        if (await this.services.objectStorage.contains(".attributes")) {
            attributes = await readAndParse(this.services.objectStorage, ".attributes");
        }
        let factory;
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
        }
        else {
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
        const channel = await factory.load(this.runtime, this.id, this.services, this.branch, attributes);
        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending) {
            try {
                this.services.deltaConnection.process(message, false, undefined /* localOpMetadata */);
            }
            catch (err) {
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
//# sourceMappingURL=remoteChannelContext.js.map