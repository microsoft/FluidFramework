/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { IContext, IQueuedMessage } from "@microsoft/fluid-server-services-core";

export class DocumentContext extends EventEmitter implements IContext {
    // We track two offsets - head and tail. Head represents the largest offset related to this document we
    // have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
    // the document.
    private headInternal: IQueuedMessage;
    private tailInternal: IQueuedMessage | undefined;

    private closed = false;

    constructor(head: IQueuedMessage, tail: IQueuedMessage | undefined) {
        super();

        // Head represents the largest offset related to the document that is not checkpointed.
        // Tail will be set to the checkpoint offset of the previous head
        this.headInternal = head;
        this.tailInternal = tail;
    }

    public get head(): IQueuedMessage {
        return this.headInternal;
    }

    public get tail(): IQueuedMessage | undefined {
        return this.tailInternal;
    }

    /**
     * Returns whether or not there is pending work in flight - i.e. the head and tail are not equal
     */
    public hasPendingWork(): boolean {
        return !this.tailInternal || this.headInternal.offset !== this.tailInternal.offset;
    }

    /**
     * Updates the head offset for the context.
     */
    public setHead(head: IQueuedMessage) {
        assert(head.offset > this.head.offset, `${head.offset} > ${this.head.offset}`);

        // When moving back to a state where head and tail differ we set the tail to be the old head, as in the
        // constructor, to make tail represent the inclusive top end of the checkpoint range.
        if (!this.hasPendingWork()) {
            this.tailInternal = this.headInternal;
        }

        this.headInternal = head;
    }

    public checkpoint(message: IQueuedMessage) {
        // Assert offset is between the current tail and head
        const offset = message.offset;

        if (this.tail) {
            assert(offset > this.tail.offset && offset <= this.head.offset,
                `${offset} > ${this.tail.offset} && ${offset} <= ${this.head.offset}`);
        }

        if (this.closed) {
            return;
        }

        // Update the tail and broadcast the checkpoint
        this.tailInternal = message;
        this.emit("checkpoint", this);
    }

    public error(error: any, restart: boolean) {
        this.emit("error", error, restart);
    }

    public close() {
        this.closed = true;
    }
}
