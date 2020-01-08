/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { IContext, IKafkaMessage } from "@microsoft/fluid-server-services-core";
import { DocumentContext } from "./documentContext";

/**
 * The DocumentContextManager manages a set of created DocumentContexts and computes an aggregate checkpoint offset
 * from them.
 */
export class DocumentContextManager extends EventEmitter {
    private readonly contexts: DocumentContext[] = [];

    // Head and tail represent our processing position of the queue. Head is the latest message seen and
    // tail is the last message processed
    private head: IKafkaMessage | undefined;
    private tail: IKafkaMessage | undefined;

    // Offset represents the last offset checkpointed
    private lastCheckpoint: number | undefined;

    private closed = false;

    constructor(private readonly partitionContext: IContext) {
        super();
    }

    public createContext(message: IKafkaMessage): DocumentContext {
        // Contexts should only be created within the processing range of the manager
        const offset = message.offset;
        if (this.tail) {
            assert(offset > this.tail.offset && offset <= this.head.offset);
        }

        // Create the new context and register for listeners on it
        const context = new DocumentContext(message, this.tail);
        this.contexts.push(context);
        context.addListener("checkpoint", () => this.updateCheckpoint());
        context.addListener("error", (error, restart) => this.emit("error", error, restart));
        return context;
    }

    public setHead(head: IKafkaMessage) {
        if (this.head) {
            assert(head.offset > this.head.offset, `${head.offset} > ${this.head.offset}`);
        }

        this.head = head;
    }

    public setTail(tail: IKafkaMessage) {
        if (this.tail) {
            assert(tail.offset > this.tail.offset && tail.offset <= this.head.offset,
                `${tail.offset} > ${this.tail.offset} && ${tail.offset} <= ${this.head.offset}`);
        }

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
        let message = this.tail;

        for(const context of  this.contexts) {
            // Utilize the tail of the context if there is still pending work. If there isn't pending work then we
            // are fully caught up
            if (context.hasPendingWork()) {
                if (!context.tail) {
                    // the context hasn't completed any work yet, we can't checkpoint further
                    return;
                    
                } else {
                    // lower the offset when possible
                    message = message.offset > context.tail.offset ? context.tail : message;
                }
            }
        };

        // Checkpoint once the offset has changed
        if (message && (this.lastCheckpoint === undefined || message.offset > this.lastCheckpoint)) {
            this.partitionContext.checkpoint(message);
            this.lastCheckpoint = message.offset;
        }
    }
}
