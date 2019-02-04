import { IContext } from "@prague/services-core";
import * as assert from "assert";
import { EventEmitter } from "events";
import { DocumentContext } from "./documentContext";

// Constant representing the previous checkpointed offset
const LastCheckpointedOffset = -1;

/**
 * The DocumentContextManager manages a set of created DocumentContexts and computes an aggregate checkpoint offset
 * from them.
 */
export class DocumentContextManager extends EventEmitter {
    private contexts: DocumentContext[] = [];

    // Head and tail represent our processing position of the queue. Head is the latest message seen and
    // tail is the last message processed
    private head = LastCheckpointedOffset;
    private tail = LastCheckpointedOffset;

    // Offset represents the last offset checkpointed
    private checkpointOffset = LastCheckpointedOffset;

    private closed = false;

    constructor(private partitionContext: IContext) {
        super();
    }

    public createContext(offset: number): DocumentContext {
        // Contexts should only be created within the processing range of the manager
        assert(offset > this.tail && offset <= this.head);

        // Create the new context and register for listeners on it
        const context = new DocumentContext(offset);
        this.contexts.push(context);
        context.addListener("checkpoint", () => this.updateCheckpoint());
        context.addListener("error", (error, restart) => this.emit("error", error, restart));
        return context;
    }

    public setHead(head: number) {
        assert(head > this.head, `${head} > ${this.head}`);
        this.head = head;
    }

    public setTail(tail: number) {
        assert(tail > this.tail && tail <= this.head, `${tail} > ${this.tail} && ${tail} <= ${this.head}`);
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
        let offset = this.tail;
        this.contexts.forEach((context) => {
            // Utilize the tail of the context if there is still pending work. If there isn't pending work then we
            // are fully caught up
            if (context.hasPendingWork()) {
                offset = Math.min(offset, context.tail);
            }
        });

        // Checkpoint once the offset has changed
        if (this.checkpointOffset !== offset) {
            this.partitionContext.checkpoint(offset);
            this.checkpointOffset = offset;
        }
    }
}
