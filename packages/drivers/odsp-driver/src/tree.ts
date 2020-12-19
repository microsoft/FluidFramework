/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer } from "@fluidframework/common-utils";

const stringEncoding = "utf-8";

export class ReadBuffer {
    protected index = 0;

    public get buffer() {
        return this.data;
    }

    constructor(protected readonly data: Uint8Array) {}

    public get eof() { return this.index === this.data.length; }
    public get pos() { return this.index; }
    public get length() { return this.data.length; }

    public slice(start: number, end: number) {
        return this.data.slice(start, end);
    }

    public read(lengthArg = 1): number {
        let res = 0;
        let multiplier = 1;
        let length = lengthArg;
        while (length > 0) {
            assert(!this.eof, "unexpected end of buffer");
            res += this.data[this.index] * multiplier;
            this.index++;
            multiplier *= 256;
            length--;
        }
        return res;
    }

    public skip(length: number) {
        assert(length >= 0);
        this.index += length;
    }
}

class WriteBuffer {
    protected data?: Uint8Array = new Uint8Array(4096);
    protected index = 0;

    public get buffer() {
        assert(this.data !== undefined);
        return this.data.slice(0, this.index);
    }

    protected push(code: number) {
        assert(this.data !== undefined);
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

    public write(codeArg: number, lengthArg = 1) {
        let code = codeArg;
        let length = lengthArg;
        while (length > 0) {
            this.push(code % 256);
            code = Math.floor(code / 256);
            length--;
        }
        assert(code === 0);
    }

    public done(): ReadBuffer {
        const buffer = new ReadBuffer(this.buffer);
        this.data = undefined;
        return buffer;
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

export abstract class BlobCore {
    public abstract get buffer(): Uint8Array;

    public toString(encoding = stringEncoding) {
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
        const pos = buffer.pos;
        buffer.skip(length);
        return new BlobShallowCopy(buffer, pos, pos + length);
    }
}

export class Node {
    protected children: (Node | BlobCore)[] = [];

    public [Symbol.iterator]() {
        return this.children[Symbol.iterator]();
    }

    public get length() { return this.children.length; }

    // Mostly for internal tools. Please use getString / getBlob / getNode API
    public get(index: number) { return this.children[index]; }

    public getString(index: number)
    {
        const node = this.children[index];
        assert(!(node instanceof Node));
        return node.toString(stringEncoding);
    }

    public getBlob(index: number)
    {
        const node = this.children[index];
        assert(!(node instanceof Node));
        return node;
    }

    public getNode(index: number)
    {
        const node = this.children[index];
        assert(node instanceof Node);
        return node;
    }

    public addNode(): Node {
        const node = new Node();
        this.children.push(node);
        return node;
    }

    public addBlob(blob: Uint8Array) {
        this.children.push(new BlobDeepCopy(blob));
    }

    public addString(payload: string) {
        this.addBlob(IsoBuffer.from(payload, stringEncoding));
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
        for (;;) {
            const code = buffer.read();
            switch (code) {
                case Codes.Array: {
                    const node = new Node();
                    this.children.push(node);
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
                    throw new Error("Invalid code");
            }
        }
    }
}

export class TreeBuilder extends Node {
    static load(buffer: ReadBuffer): TreeBuilder {
        const builder = new TreeBuilder();
        assert(buffer.read() === Codes.Array);
        builder.load(buffer);
        assert(buffer.read() === Codes.EOF, "no eof marker");
        assert(buffer.eof, "unexpected data at the end of buffer");
        return builder;
    }

    public serialize(): ReadBuffer {
        const buffer = new WriteBuffer();
        super.serialize(buffer);
        buffer.write(Codes.EOF);
        return buffer.done();
    }
}
