import * as assert from "assert";
import { EventEmitter } from "events";
import { IContext } from "../kafka-service/lambdas";

export class DocumentContext extends EventEmitter implements IContext {
    // We track two offsets - head and tail. Head represents the largest offset related to this document we
    // have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
    // the document.
    private tailInternal: number;
    private headInternal: number;

    constructor(head: number, tail: number) {
        super();

        assert(head > tail);
        this.headInternal = head;
        this.tailInternal = tail;
    }

    public get head(): number {
        return this.headInternal;
    }

    public get tail(): number {
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
    public setHead(head: number) {
        assert(head > this.head);
        this.headInternal = head;
    }

    public checkpoint(offset: number) {
        // Assert offset is between the current tail and head
        assert(offset > this.tail && offset <= this.head);

        // Update the tail and broadcast the checkpoint
        this.tailInternal = offset;
        this.emit("checkpoint", this);
    }

    public error(error: any, restart: boolean) {
        this.emit("error", error, restart);
    }
}
