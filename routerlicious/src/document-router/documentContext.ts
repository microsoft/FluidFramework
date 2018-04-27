import * as assert from "assert";
import { EventEmitter } from "events";
import { IContext } from "../kafka-service/lambdas";

export class DocumentContext extends EventEmitter implements IContext {
    // We track two offsets - head and tail. Head represents the largest offset related to this document we
    // have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
    // the document.
    private tailInternal: number;
    private headInternal: number;

    private closed = false;

    constructor(head: number) {
        super();

        // We initialize tail to one less than head. Head represents the largest offset related to the document
        // that is not checkpointed. We can set tail to one less than the head since offsets are monotonically
        // increasing. This preserves the invariants and simplifies the math performed to merge various DocumentContext
        // ranges since we always operate with inclusive ranges.
        this.headInternal = head;
        this.tailInternal = head - 1;
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

        // When moving back to a state where head and tail differ we again subtract one from the head, as in the
        // constructor, to make tail represent the inclusive top end of the checkpoint range.
        if (!this.hasPendingWork()) {
            this.tailInternal = head - 1;
        }

        this.headInternal = head;
    }

    public checkpoint(offset: number) {
        // Assert offset is between the current tail and head
        assert(offset > this.tail && offset <= this.head);

        if (this.closed) {
            return;
        }

        // Update the tail and broadcast the checkpoint
        this.tailInternal = offset;
        this.emit("checkpoint", this);
    }

    public error(error: any, restart: boolean) {
        this.emit("error", error, restart);
    }

    public close() {
        this.closed = true;
    }
}
