/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { IContext, IQueuedMessage } from "@fluidframework/server-services-core";
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
    private readonly contexts: DocumentContext[] = [];

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
        const context = new DocumentContext(head, () => this.tail);
        this.contexts.push(context);
        context.addListener("checkpoint", () => this.updateCheckpoint());
        context.addListener("error", (error, restart) => this.emit("error", error, restart));
        return context;
    }

    public setHead(head: IQueuedMessage) {
        assert(head.offset > this.head.offset, `${head.offset} > ${this.head.offset}`);

        this.head = head;
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
