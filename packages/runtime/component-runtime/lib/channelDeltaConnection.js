/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
export class ChannelDeltaConnection {
    constructor(objectId, _connected, submitFn, dirtyFn) {
        this.objectId = objectId;
        this._connected = _connected;
        this.submitFn = submitFn;
        this.dirtyFn = dirtyFn;
    }
    get handler() {
        assert(this._handler);
        return this._handler;
    }
    get connected() {
        return this._connected;
    }
    attach(handler) {
        assert(this._handler === undefined);
        this._handler = handler;
    }
    setConnectionState(connected) {
        this._connected = connected;
        this.handler.setConnectionState(connected);
    }
    process(message, local, localOpMetadata) {
        this.handler.process(message, local, localOpMetadata);
    }
    reSubmit(content, localOpMetadata) {
        this.handler.reSubmit(content, localOpMetadata);
    }
    /**
     * Send new messages to the server
     */
    submit(message, localOpMetadata) {
        this.submitFn(message, localOpMetadata);
    }
    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a SharedSummaryBlock
     * that needs to be part of the summary but does not generate ops.
     */
    dirty() {
        this.dirtyFn();
    }
}
//# sourceMappingURL=channelDeltaConnection.js.map