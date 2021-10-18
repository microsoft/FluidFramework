/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import {
    IContext,
    IQueuedMessage,
    ILogger,
    IContextErrorData,
    IRoutingKey,
} from "@fluidframework/server-services-core";

export class DocumentContext extends EventEmitter implements IContext {
    // We track two offsets - head and tail. Head represents the largest offset related to this document we
    // have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
    // the document.
    private headInternal: IQueuedMessage;
    private tailInternal: IQueuedMessage;

    private closed = false;
    private contextError = undefined;

    constructor(
        private readonly routingKey: IRoutingKey,
        head: IQueuedMessage,
        public readonly log: ILogger | undefined,
        private readonly getLatestTail: () => IQueuedMessage) {
        super();

        // Head represents the largest offset related to the document that is not checkpointed.
        // Tail will be set to the checkpoint offset of the previous head
        this.headInternal = head;
        this.tailInternal = this.getLatestTail();
    }

    public get head(): IQueuedMessage {
        return this.headInternal;
    }

    public get tail(): IQueuedMessage {
        return this.tailInternal;
    }

    /**
     * Returns whether or not there is pending work in flight - i.e. the head and tail are not equal
     */
    public hasPendingWork(): boolean {
        return this.headInternal !== this.tailInternal;
    }

    /**
     * Updates the head offset for the context.
     */
    public setHead(head: IQueuedMessage) {
        assert(head.offset > this.head.offset,
            `${head.offset} > ${this.head.offset} ` +
            `(${head.topic}, ${head.partition}, ${this.routingKey.tenantId}/${this.routingKey.documentId})`);

        // When moving back to a state where head and tail differ we set the tail to be the old head, as in the
        // constructor, to make tail represent the inclusive top end of the checkpoint range.
        if (!this.hasPendingWork()) {
            this.tailInternal = this.getLatestTail();
        }

        this.headInternal = head;
    }

    public checkpoint(message: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        // Assert offset is between the current tail and head
        const offset = message.offset;

        assert(offset > this.tail.offset && offset <= this.head.offset,
            `${offset} > ${this.tail.offset} && ${offset} <= ${this.head.offset} ` +
            `(${message.topic}, ${message.partition}, ${this.routingKey.tenantId}/${this.routingKey.documentId})`);

        // Update the tail and broadcast the checkpoint
        this.tailInternal = message;
        this.emit("checkpoint", this);
    }

    public error(error: any, errorData: IContextErrorData) {
        this.contextError = error;
        this.emit("error", error, errorData);
    }

    public close() {
        this.closed = true;

        this.removeAllListeners();
    }

    public getContextError() {
        return this.contextError;
    }
}
