/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { IContentMessage } from "@fluidframework/protocol-definitions";
import { debug } from "./debug";

/* eslint-disable no-bitwise */
class RingBuffer {
    private log2Capacity: number;
    private length: number;
    private lengthMask: number;
    private head = 0;
    private tail = 0;
    private buffer: IContentMessage[] = [];

    constructor(log2Cap: number) {
        this.log2Capacity = log2Cap;
        this.length = (1 << log2Cap);
        this.lengthMask = this.length - 1;
        this.buffer = Array(this.length).fill(undefined);
    }

    public enqueue(data: IContentMessage): void {
        const newHead = (this.head + 1) & this.lengthMask;
        if (newHead !== this.tail) {
            this.buffer[this.head] = data;
            this.head = newHead;
        } else {
            this.resize();
            this.buffer[this.head] = data;
            this.head = (this.head + 1) & this.lengthMask;
        }
    }

    public dequeue(): IContentMessage | undefined {
        if (this.head === this.tail) {
            return undefined;
        } else {
            const data = this.buffer[this.tail];
            this.tail = (this.tail + 1) & this.lengthMask;
            return data;
        }
    }

    public peek(): IContentMessage | undefined {
        if (this.head === this.tail) {
            return undefined;
        } else {
            const data = this.buffer[this.tail];
            return data;
        }
    }

    private resize() {
        debug(`Resizing content buffer from ${this.length}!`);
        assert.notStrictEqual(this.head, this.tail, "Content buffer size error");
        let newBuffer: IContentMessage[] = [];
        if (this.head < this.tail) {
            newBuffer = this.buffer.slice(this.tail);
            newBuffer.push(...this.buffer.slice(0, this.head));
        } else {
            assert.equal(this.tail, 0, "Buffer tail should point at start");
            newBuffer = this.buffer.slice(0, this.head);
        }
        this.log2Capacity += 1;
        this.length = (1 << this.log2Capacity);
        this.lengthMask = this.length - 1;
        this.head = newBuffer.length;
        this.tail = 0;
        newBuffer.push(...Array(this.head).fill(undefined));
        this.buffer = newBuffer;
    }
}
/* eslint-enable no-bitwise */

export class ContentCache extends EventEmitter {
    private readonly cache = new Map<string, RingBuffer>();

    constructor(private readonly log2Capacity: number) {
        super();
    }

    public set(message: IContentMessage) {
        const clientId = message.clientId;
        if (!this.cache.has(clientId)) {
            this.cache.set(clientId, new RingBuffer(this.log2Capacity));
        }
        this.cache.get(clientId)!.enqueue(message);
        this.emit("content", clientId);
    }

    public get(clientId: string): IContentMessage | undefined {
        return this.cache.has(clientId) ? this.cache.get(clientId)!.dequeue() : undefined;
    }

    public peek(clientId: string): IContentMessage | undefined {
        return this.cache.has(clientId) ? this.cache.get(clientId)!.peek() : undefined;
    }
}
