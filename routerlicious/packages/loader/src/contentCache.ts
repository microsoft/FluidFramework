// tslint:disable
import { EventEmitter } from "events";

export class ContentCache extends EventEmitter {
    private cache = new Map<string, RingBuffer>();

    constructor(private log2Capacity: number) {
        super();
    }

    public set(messages: any[]) {
        for (const message of messages) {
            const clientId = message.clientId;
            if (!this.cache.has(clientId)) {
                this.cache.set(clientId, new RingBuffer(this.log2Capacity));
            }
            this.cache.get(clientId).enqueue(message.op);
            this.emit("content", clientId);
        }
    }

    public get(clientId: string) {
        return this.cache.has(clientId) ? this.cache.get(clientId).dequeue() : undefined;
    }
}

class RingBuffer {    
    private log2Capacity: number;
    private length: number;
    private lengthMask: number;
    private head = 0;
    private tail = 0;
    private buffer = [];
    
    constructor(log2Cap: number) {
        this.log2Capacity = log2Cap;
        this.length = (1 << log2Cap);
        this.lengthMask = this.length - 1;
        for (let i = 0; i < this.length; ++i) {
            this.buffer.push(undefined);
        }
    }

    public enqueue(data: any): void {
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

    public dequeue() {
        if (this.head === this.tail) {
            return undefined;
        } else {
            const data = this.buffer[this.tail];
            this.tail = (this.tail + 1) & this.lengthMask;
            return data;
        }       
    }

    private resize() {
        console.log(`Resizing content buffer from ${this.length}!`);
        const tempBuffer = [];
        for (let i = this.tail; i < this.length; ++i) {
            if (i == this.head) continue;
            tempBuffer.push(this.buffer[i]);
        }
        for (let i = 0; i < this.tail; ++i) {
            if (i == this.head) continue;
            tempBuffer.push(this.buffer[i]);
        }
        ++this.log2Capacity;
        this.length = (1 << this.log2Capacity);
        this.lengthMask = this.length - 1;
        this.head = tempBuffer.length;
        this.tail = 0;
        for (let i = tempBuffer.length; i < this.length; ++i) {
            tempBuffer.push(undefined);
        }
        this.buffer = tempBuffer;
    }
}
