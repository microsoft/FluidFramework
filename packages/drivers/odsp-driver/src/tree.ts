/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer } from "@fluidframework/common-utils";

/** Default encoding for strings */
const stringEncoding = "utf-8";

/**
 * Buffer class, used to sequentially reading data.
 * Used by tree code to reconstruct a tree from binary representation.
 */
export class ReadBuffer {
    protected index = 0;

    public get buffer() {
        return this.data;
    }

    constructor(protected readonly data: Uint8Array) {
        // BlobShallowCopy will return to users parts of this array.
        // We need to ensure that nobody can change it, as it will have
        // catastrophic result and will be really hard to investigate
        Object.freeze(data.buffer);
    }

    public get eof() { return this.index === this.data.length; }
    public get pos() { return this.index; }
    public get length() { return this.data.length; }

    public slice(start: number, end: number) {
        return this.data.slice(start, end);
    }

    public reset() {
        this.index = 0;
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
        assert(length >= 0, "skip");
        this.index += length;
    }
}

/**
 * Buffer class, used to sequentially writing data.
 * Used by tree code to serialize tree into binary representation.
 */
class WriteBuffer {
    protected data?: Uint8Array = new Uint8Array(4096);
    protected index = 0;

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
        assert(this.data !== undefined);
        // We can slice it to have smaller memory representation.
        // But it will be way more expensive in terms of CPU cycles!
        const buffer = new ReadBuffer(this.data.subarray(0, this.index));
        this.data = undefined;
        return buffer;
    }
}

/**
 * Control codes used by tree serialization / decentralization code.
 */
enum Codes {
    // IDs for blobs have to be sequential!
    Blob0 = 0, // Used only for math.
    Blob1 = 1,
    Blob2 = 2,
    Blob3 = 3,
    Blob4 = 4,

    Number0 = 5, // Used only for math.
    Number1 = 6,
    Number2 = 7,
    Number3 = 8,
    Number4 = 9,

    TreeNode = 10,
    Up = 11,
    EOF = 12,
}

/**
 * Calculate how many bytes are required to encode an integer.
 * @param num - number to encode.
 */
function calcLength(num: number) {
    let max = 256;
    let lengthLen = 1;
    while (num >= max) {
        max *= 256;
        lengthLen++;
    }
    return lengthLen;
}

/**
 * Base class to represent binary blob element.
 * Binary blob is one of three types supported as a leaf node of a tree.
 * Note: concrete implementations (derived classes) are not exposed from this module
 */
export abstract class BlobCore {
    public abstract get buffer(): Uint8Array;

    public toString(encoding = stringEncoding) {
        return IsoBuffer.from(this.buffer).toString(encoding);
    }

    public write(buffer: WriteBuffer) {
        const data = this.buffer;
        const lengthLen = calcLength(data.length);
        buffer.write(Codes.Blob0 + lengthLen);
        buffer.write(data.length, lengthLen);
        for (const el of data) {
            buffer.write(el);
        }
    }
}

/**
 * "deep copy" blob, holds to binary data passed in
 * It is called deep copy as a counter-part to BlobShallowCopy, which
 * is a reference to underlying binary stream (ReadBuffer).
*/
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
        for (let counter = 0; counter < length; counter ++) {
            data[counter] = buffer.read();
        }
        return new BlobDeepCopy(data);
    }
}

/**
 * Shallow copy blob, keeps a reference to portion of ReadBuffer
 * it was constructed from. It takes much less memory compared to BlobDeepCopy
 */
export class BlobShallowCopy extends BlobCore {
    constructor(protected data: ReadBuffer, protected start: number, protected end: number) {
        super();
    }

    public get buffer() {
        return this.data.buffer.subarray(this.start, this.end);
        // return this.data.slice(this.start, this.end);
    }

    public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
        const length = buffer.read(lengthLen);
        const pos = buffer.pos;
        buffer.skip(length);
        return new BlobShallowCopy(buffer, pos, pos + length);
    }
}

export function iteratePairs<T>(it: IterableIterator<T>) {
    const res: IterableIterator<[T, T]> = {
        next: () => {
            const a = it.next();
            if (a.done) {
                return { value: undefined, done: true };
            }
            const b = it.next();
            assert(b.done !== true);
            return { value: [a.value, b.value], done: b.done };
        },
        [Symbol.iterator]: () => { return res; },
    };
    return res;
}

/**
 * Helper function that returns iterator from an object
 * @param obj - object that supports iteration
 */
export function iterate<T>(obj: {[Symbol.iterator]: () => IterableIterator<T>}) {
    return obj[Symbol.iterator]();
}

/**
 * Three leaf types supported by tree:
 * 1. Node (sub-tree)
 * 2. binary blob
 * 3. integer
 */
export type NodeTypes = Node | BlobCore | number;

/**
 * Node - node in the tree (non-leaf element of the tree)
 */
export class Node {
    protected children: NodeTypes[] = [];

    public [Symbol.iterator]() {
        return this.children[Symbol.iterator]();
    }

    public iteratePairs() {
        assert((this.length % 2) === 0, "reading pairs");
        return iteratePairs(iterate(this));
    }

    public get length() { return this.children.length; }

    // Mostly for internal tools. Please use getString / getBlob / getNode API
    public get(index: number) { return this.children[index]; }

    public getString(index: number)
    {
        const node = this.children[index];
        assert(node instanceof BlobCore);
        return node.toString(stringEncoding);
    }

    public getBlob(index: number)
    {
        const node = this.children[index];
        assert(node instanceof BlobCore);
        return node;
    }

    public getNode(index: number)
    {
        const node = this.children[index];
        assert(node instanceof Node);
        return node;
    }

    public getNumber(index: number): number
    {
        const node = this.children[index];
        assert(typeof node === "number");
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

    public addNumber(payload: number | undefined) {
        assert(payload !== undefined, "undefined");
        assert(Number.isInteger(payload), "not int");
        assert(payload >= 0, "negative");
        this.children.push(payload);
    }

    public serialize(buffer: WriteBuffer) {
        buffer.write(Codes.TreeNode);
        for (const child of this.children) {
            if (child instanceof Node) {
                child.serialize(buffer);
            } else if (child instanceof BlobCore) {
                child.write(buffer);
            } else {
                const len = calcLength(child);
                buffer.write(Codes.Number0 + len);
                buffer.write(child, len);
            }
        }
        buffer.write(Codes.Up);
    }

    protected load(buffer: ReadBuffer) {
        for (;;) {
            const code = buffer.read();
            switch (code) {
                case Codes.TreeNode: {
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

                case Codes.Number1:
                case Codes.Number2:
                case Codes.Number3:
                case Codes.Number4:
                {
                    const num = buffer.read(code - Codes.Number0);
                    this.children.push(num);
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

/**
 * TreeBuilder - root of the tree.
 * Provides loading and serialization capabilities.
 */
export class TreeBuilder extends Node {
    static load(buffer: ReadBuffer): TreeBuilder {
        const builder = new TreeBuilder();
        assert(buffer.read() === Codes.TreeNode, "array");
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
