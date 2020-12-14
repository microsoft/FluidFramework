/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer } from "@fluidframework/common-utils";

class Buffer {
    protected data: Uint8Array = new Uint8Array(4096);
    protected index = 0;

    public get buffer() {
        return this.data.slice(0, this.index);
    }
}

class WriteBuffer extends Buffer {
    protected push(code: number) {
        const length = this.data.length;
        if (this.index === length) {
            const newData = new Uint8Array(length * 1.2 + 4096);
            let index = 0;
            const oldData = this.data;
            while (index < length) {
                newData[index] = oldData[index];
                index++;
            }
            this.data = newData;
        }
        this.data[this.index] = code % 256;
        this.index++;
    }

    public write(codeArg: number, length = 1) {
        let code = codeArg;
        while (length > 0) {
            this.push(code % 256);
            code = Math.ceil(code / 256);
        }
        assert(code === 0);
    }
}

class ReadBuffer {
    protected index = 0;

    constructor(protected readonly data: Uint8Array) {}

    public get eof() { return this.index === this.data.length; }
    public get pos() { return this.index; }

    public slice(start: number, end: number) {
        return this.data.slice(start, end);
    }

    public read(length = 1): number {
        let res = 0;
        let multiplier = 1;
        while (length > 0) {
            assert(!this.eof, "unexpected end of buffer");
            res += this.data[this.index] * multiplier;
            this.index++;
            multiplier *= 256;
        }
        return res;
    }
}

enum Codes {
    // IDs for blobs have to be sequential!
    Blob0 = 0, // Used only for math.
    Blob1 = 1,
    Blob2 = 2,
    Blob3 = 3,
    Blob4 = 4,
    Array = 5,
    Up = 6,
    EOF = 7,
}

abstract class BlobCore {
    public abstract get buffer();

    public static fromString(data: string, encoding = "utf-8"): BlobCore {
        return new BlobDeepCopy(IsoBuffer.from(data, encoding));
    }

    public toString(encoding = "utf-8") {
        return IsoBuffer.from(this.buffer).toString(encoding);
    }

    public write(buffer: WriteBuffer) {
        let max = 256;
        let lengthLen = 1;
        const data = this.buffer;
        while (data.length >= max) {
            max *= 256;
            lengthLen++;
        }
        buffer.write(Codes.Blob0 + lengthLen);
        buffer.write(data.length, lengthLen);
        for (const el of data) {
            buffer.write(el);
        }
    }
}

class BlobDeepCopy extends BlobCore {
    constructor(protected readonly data: Uint8Array) {
        super();
    }

    public get buffer() {
        return this.data;
    }

    public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
        const length = buffer.read(lengthLen);
        const data = new Uint8Array(length);
        const blob = new BlobDeepCopy(data);
        let counter = 0;
        while (counter !== length) {
            data[counter] = buffer.read();
            counter++;
        }
        return blob;
    }
}

class BlobShallowCopy extends BlobCore {
    constructor(protected data: ReadBuffer, protected start: number, protected end: number) {
        super();
    }

    public get buffer() {
        return this.data.slice(this.start, this.end);
    }

    public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
        const length = buffer.read(lengthLen);
        return new BlobShallowCopy(buffer, buffer.pos, buffer.pos + length);
    }
}

class Node {
    protected children: (Node | BlobCore)[] = [];

    public addChildNode(): Node {
        const node = new Node();
        this.children.push(node);
        return node;
    }

    public addChildBuffer(blob: BlobCore) {
        this.children.push(blob);
    }

    public serialize(buffer: WriteBuffer) {
        buffer.write(Codes.Array);
        for (const child of this.children) {
            if (child instanceof Node) {
                child.serialize(buffer);
            } else {
                child.write(buffer);
            }
        }
        buffer.write(Codes.Up);
    }

    protected load(buffer: ReadBuffer) {
        const code = buffer.read();
        switch (code) {
            case Codes.Array: {
                const node = new Node();
                node.load(buffer);
                break;
            }

            case Codes.Blob1:
            case Codes.Blob2:
            case Codes.Blob3:
            case Codes.Blob4:
            {
                const blob = BlobShallowCopy.read(buffer, code - Codes.Blob0);
                this.children.push(blob);
                break;
            }

            case Codes.Up:
                return;

            default:
                assert(false, "Invalid code");
        }
    }
}

export class TreeBuilder extends Node {
    static load(buffer: ReadBuffer) {
        const root = new TreeBuilder();
        assert(buffer.read() === Codes.Array);
        root.load(buffer);
        assert(buffer.read() === Codes.EOF, "no eof marker");
        assert(buffer.eof, "unexpected data at the end of buffer");
    }

    public serialize(): Buffer {
        const buffer = new WriteBuffer();
        super.serialize(buffer);
        buffer.write(Codes.EOF);
        return buffer;
    }
}
