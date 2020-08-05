/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { convertToSummaryTree } from "@fluidframework/runtime-utils";
import { createServiceEndpoints, snapshotChannel } from "./channelContext";
/**
 * Channel context for a locally created channel
 */
export class LocalChannelContext {
    constructor(id, registry, type, runtime, componentContext, storageService, submitFn, dirtyFn) {
        this.componentContext = componentContext;
        this.storageService = storageService;
        this.submitFn = submitFn;
        this.attached = false;
        const factory = registry.get(type);
        if (factory === undefined) {
            throw new Error(`Channel Factory ${type} not registered`);
        }
        this.channel = factory.create(runtime, id);
        this.dirtyFn = () => { dirtyFn(id); };
    }
    async getChannel() {
        return this.channel;
    }
    setConnectionState(connected, clientId) {
        // Connection events are ignored if the component is not yet attached
        if (!this.attached) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection.setConnectionState(connected);
    }
    processOp(message, local, localOpMetadata) {
        assert(this.attached, "Local channel must be attached when processing op");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection.process(message, local, localOpMetadata);
    }
    reSubmit(content, localOpMetadata) {
        assert(this.attached, "Local channel must be attached when resubmitting op");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection.reSubmit(content, localOpMetadata);
    }
    async snapshot(fullTree = false) {
        return this.getAttachSnapshot();
    }
    async summarize(fullTree = false) {
        const snapshot = this.getAttachSnapshot();
        const summary = convertToSummaryTree(snapshot, fullTree);
        return summary;
    }
    getAttachSnapshot() {
        return snapshotChannel(this.channel);
    }
    attach() {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }
        const services = createServiceEndpoints(this.channel.id, this.componentContext.connected, this.submitFn, this.dirtyFn, this.storageService);
        this.connection = services.deltaConnection;
        this.channel.connect(services);
        this.attached = true;
    }
}
//# sourceMappingURL=localChannelContext.js.map