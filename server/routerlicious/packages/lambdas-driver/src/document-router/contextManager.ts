/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { IContext, IContextErrorData, IQueuedMessage } from "@fluidframework/server-services-core";
import { DocumentContext } from "./documentContext";

const LastCheckpointedOffset: IQueuedMessage = {
    offset: -1,
    partition: -1,
    topic: "",
    value: undefined,
};

/**
 * The DocumentContextManager manages a set of created DocumentContexts and computes an aggregate checkpoint offset
 * from them.
 */
export class DocumentContextManager extends EventEmitter {
    private readonly contexts: Set<DocumentContext> = new Set();

    // Head and tail represent our processing position of the queue. Head is the latest message seen and
    // tail is the last message processed
    private head = LastCheckpointedOffset;
    private tail = LastCheckpointedOffset;

    // Offset represents the last offset checkpointed
    private lastCheckpoint = LastCheckpointedOffset;

    private closed = false;

    constructor(private readonly partitionContext: IContext) {
        super();
    }

    public createContext(head: IQueuedMessage): DocumentContext {
        // Contexts should only be created within the processing range of the manager
        assert(head.offset > this.tail.offset && head.offset <= this.head.offset);

        // Create the new context and register for listeners on it
        const context = new DocumentContext(head, this.partitionContext.log, () => this.tail);
        this.contexts.add(context);
        context.addListener("checkpoint", () => this.updateCheckpoint());
        context.addListener("error", (error, errorData: IContextErrorData) => this.emit("error", error, errorData));
        return context;
    }

    public removeContext(context: DocumentContext): void {
        this.contexts.delete(context);
    }

    public getHeadOffset() {
        return this.head.offset;
    }

    /**
     * Updates the head to the new offset. The head offset will not be updated if it stays the same or moves backwards.
     * @returns True if the head was updated, false if it was not.
     */
    public setHead(head: IQueuedMessage) {
        if (head.offset > this.head.offset) {
            this.head = head;
            return true;
        }

        return false;
    }

    public setTail(tail: IQueuedMessage) {
        assert(tail.offset > this.tail.offset && tail.offset <= this.head.offset,
            `${tail.offset} > ${this.tail.offset} && ${tail.offset} <= ${this.head.offset}`);

        this.tail = tail;
        this.updateCheckpoint();
    }

    public close() {
        this.closed = true;

        for (const context of this.contexts) {
            context.close();
        }

        this.contexts.clear();

        this.removeAllListeners();
    }

    private updateCheckpoint() {
        if (this.closed) {
            return;
        }

        // Set the starting offset at the tail. Contexts can then lower that offset based on their positions.
        let queuedMessage = this.tail;

        for (const context of this.contexts) {
            // Utilize the tail of the context if there is still pending work.
            // If there isn't pending work then we are fully caught up.
            if (context.hasPendingWork()) {
                // Lower the offset when possible
                queuedMessage = queuedMessage.offset > context.tail.offset ? context.tail : queuedMessage;
            }
        }

        // Checkpoint once the offset has changed
        if (queuedMessage.offset !== this.lastCheckpoint.offset) {
            this.partitionContext.checkpoint(queuedMessage);
            this.lastCheckpoint = queuedMessage;
        }
    }
}
