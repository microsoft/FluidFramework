/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";

/** Default encoding for strings */
const stringEncoding = "utf-8";

/**
 * Buffer class, used to sequentially read data.
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
        // catastrophic result and will be really hard to investigate.
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
        assert(length >= 0, "Skip length should be positive");
        this.index += length;
    }
}

/**
 * Buffer class, used to sequentially writ data.
 * Used by tree code to serialize tree into binary representation.
 */
class WriteBuffer {
    protected data?: Uint8Array = new Uint8Array(4096);
    protected index = 0;

    protected push(code: number) {
        assert(this.data !== undefined, "Data should be there");
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
        assert(code === 0, `Should write complete data code= ${codeArg} ${lengthArg}`);
    }

    public done(): ReadBuffer {
        assert(this.data !== undefined, "Data should be there");
        // We can slice it to have smaller memory representation.
        // But it will be way more expensive in terms of CPU cycles!
        const buffer = new ReadBuffer(this.data.subarray(0, this.index));
        this.data = undefined;
        return buffer;
    }
}

/**
 * Control codes used by tree serialization / decentralization code. Same as on server.
 */
enum MarkerCodes {
    ListStart = 49,
    ListEnd = 50,

    StringEmpty = 13,       // value = ""
    String8Length = 14,     // unsigned-8-bit little-endian length, follows by UTF-8 bytes of length
    String16Length = 15,    // unsigned-16-bit little-endian length, follows by UTF-8 bytes of length
    String32Length = 16,    // unsigned-32-bit little-endian length, follows by UTF-8 bytes of length

    Int0 = 1,   // value = 0
    UInt8 = 3,  // unsigned-8-bit little-endian follows
    UInt16 = 5, // unsigned-16-bit little-endian follows
    UInt32 = 7, // unsigned-32-bit little-endian follows
    UInt64 = 9, // unsigned-64-bit little-endian follows

    BinaryEmpty = 32,        // value = byte[]
    BinarySingle8 = 33,      // unsigned-8-bit little-endian length, follows by bytes of length
    BinarySingle16 = 34,     // unsigned-16-bit little-endian length, follows by bytes of length
    BinarySingle32 = 35,     // unsigned-32-bit little-endian length, follows by bytes of length
    BinarySingle64 = 36,     // unsigned-64-bit little-endian length, follows by bytes of length
}

/**
 * This contains mapping of Marker Codes to number of bytes in which the corresponding data
 * will be stored.
*/
const codeToBytesMap = {
    // Integer code to bytes
    1: 0,
    3: 1,
    5: 2,
    7: 4,
    9: 8,

    // String code to Bytes
    13: 0,
    14: 1,
    15: 2,
    16: 4,

    // Binary code to bytes
    32: 0,
    33: 1,
    34: 2,
    35: 4,
    36: 8,
};

/**
 * This contains mapping of number of bytes to Marker Codes representing the corresponding Integer.
*/
const integerBytesToCodeMap = {
    0: 1,
    1: 3,
    2: 5,
    4: 7,
    8: 9,
};

/**
 * This contains mapping of number of bytes representing the corresponding string length to Marker Codes.
*/
const utf8StringBytesToCodeMap = {
    0: 13,
    1: 14,
    2: 15,
    4: 16,
};

/**
 * This contains mapping of number of bytes representing the corresponding length in which actual data(base64 string)
 * will be stored to Marker Codes.
*/
const base64StringBytesToCodeMap = {
    0: 32,
    1: 33,
    2: 34,
    4: 35,
    8: 16,
};

/**
 * Calculate how many bytes are required to encode an integer. This is always multiple of 2.
 * So if 6 bytes are required to store an integer than it will return 8.
 * @param num - number to encode.
 */
function calcLength(numArg: number) {
    let num = numArg;
    let lengthLen = 0;
    while (num > 0) {
        num = Math.floor(num / 256);
        lengthLen++;
    }
    let res = 0;
    let index = 0;
    while (res < lengthLen) {
        res = Math.pow(2, index);
        index++;
    }
    return res;
}

export function iteratePairs<T>(it: IterableIterator<T>) {
    const res: IterableIterator<[T, T]> = {
        next: () => {
            const a = it.next();
            if (a.done) {
                return { value: undefined, done: true };
            }
            const b = it.next();
            assert(b.done !== true, "Should be a pair");
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
 * Base class to represent binary blob element.
 * Binary blob is one of three types supported as a leaf node of a tree.
 * Note: concrete implementations (derived classes) are not exposed from this module
 */
export abstract class BlobCore {
    public abstract get buffer(): Uint8Array;
    /**
     * Represents a blob.
     * @param useUtf8Code - Represents if the utf8 string marker code should be used when representing.
     */
    constructor(private readonly useUtf8Code: boolean = false) {}

    public toString(encoding = stringEncoding) {
        return Uint8ArrayToString(this.buffer, encoding);
    }

    public write(buffer: WriteBuffer) {
        const data = this.buffer;
        const lengthLen = calcLength(data.length);
        // Write Marker code.
        buffer.write(this.useUtf8Code ? utf8StringBytesToCodeMap[lengthLen] : base64StringBytesToCodeMap[lengthLen]);
        // Write actual data if length greater than 0, otherwise Marker Code is enough.
        if (lengthLen > 0) {
            buffer.write(data.length, lengthLen);
            for (const element of data) {
                buffer.write(element);
            }
        }
    }
}

/**
 * "deep copy" blob, holds to binary data passed in
 * It is called deep copy as a counter-part to BlobShallowCopy, which
 * is a reference to underlying binary stream (ReadBuffer).
*/
class BlobDeepCopy extends BlobCore {
    /**
     * Represents a deep copy of the blob.
     * @param data - Data array of the blob
     * @param useUtf8Code - Represents if the utf8 string marker code should be used when representing.
     */
    constructor(protected readonly data: Uint8Array, useUtf8Code: boolean = false) {
        super(useUtf8Code);
    }

    public get buffer() {
        return this.data;
    }

    public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
        const length = buffer.read(lengthLen);
        const data = new Uint8Array(length);
        for (let counter = 0; counter < length; counter++) {
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
    /**
     * Represents a shallow copy of the blob. It is not a separate blob, just reference to original blobs.
     * @param data - Data array of the blob
     * @param start - Start point of the blob in the buffer.
     * @param end - End point of the blob in the buffer.
     */
    constructor(protected data: ReadBuffer, protected start: number, protected end: number) {
        super();
    }

    public get buffer() {
        return this.data.buffer.subarray(this.start, this.end);
    }

    public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
        const length = buffer.read(lengthLen);
        const pos = buffer.pos;
        buffer.skip(length);
        return new BlobShallowCopy(buffer, pos, pos + length);
    }
}

/**
 * Three leaf types supported by tree:
 * 1. Node (sub-tree)
 * 2. binary blob
 * 3. integer
 */
export type NodeTypes = NodeCore | BlobCore | number;

/**
 * Node - node in the tree (non-leaf element of the tree)
 */
export class NodeCore {
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
        assert(node instanceof BlobCore, "Type of node does not match");
        return node.toString(stringEncoding);
    }

    public getBlob(index: number)
    {
        const node = this.children[index];
        assert(node instanceof BlobCore, "Type of node does not match");
        return node;
    }

    public getNode(index: number)
    {
        const node = this.children[index];
        assert(node instanceof NodeCore, "Type of node does not match");
        return node;
    }

    public getNumber(index: number): number
    {
        const node = this.children[index];
        assert(typeof node === "number", "Type of node does not match");
        return node;
    }

    public addNode(): NodeCore {
        const node = new NodeCore();
        this.children.push(node);
        return node;
    }

    public addBlob(blob: Uint8Array, useUtf8Code: boolean = false) {
        this.children.push(new BlobDeepCopy(blob, useUtf8Code));
    }

    public addString(payload: string) {
        this.addBlob(IsoBuffer.from(payload, stringEncoding), true);
    }

    public addNumber(payload: number | undefined) {
        assert(Number.isInteger(payload), "Number should be an integer");
        assert(payload !== undefined && payload >= 0, "Payload should not be negative");
        this.children.push(payload);
    }

    /**
     * Implementation of serialization of buffer with Marker Codes etc.
     * @param buffer - Buffer to serialize.
     */
    public serialize(buffer: WriteBuffer) {
        for (const child of this.children) {
            if (child instanceof NodeCore) {
                // For a tree node start and end with ListStart and end marker codes.
                buffer.write(MarkerCodes.ListStart);
                child.serialize(buffer);
                buffer.write(MarkerCodes.ListEnd);
            } else if (child instanceof BlobCore) {
                child.write(buffer);
            } else {
                // Calculate length in which integer will be stored
                const len = calcLength(child);
                // Write corresponding Marker code for length of integer.
                buffer.write(integerBytesToCodeMap[len]);
                // Write actual number if greater than 0, otherwise Marker Code is enough.
                if (len > 0) {
                    buffer.write(child, len);
                }
            }
        }
    }

    /**
     * Load and parse the buffer into a tree.
     * @param buffer - buffer to read from.
     */
    protected load(buffer: ReadBuffer) {
        for (;!buffer.eof;) {
            const code = buffer.read();
            switch (code) {
                case MarkerCodes.ListStart: {
                    const node = new NodeCore();
                    this.children.push(node);
                    node.load(buffer);
                    break;
                }

                case MarkerCodes.StringEmpty:
                case MarkerCodes.String8Length:
                case MarkerCodes.String16Length:
                case MarkerCodes.String32Length:
                case MarkerCodes.BinaryEmpty:
                case MarkerCodes.BinarySingle8:
                case MarkerCodes.BinarySingle16:
                case MarkerCodes.BinarySingle32:
                case MarkerCodes.BinarySingle64:
                {
                    const blob = BlobShallowCopy.read(buffer, codeToBytesMap[code]);
                    this.children.push(blob);
                    break;
                }
                // If integer is 0.
                case MarkerCodes.Int0:
                {
                    this.children.push(0);
                    break;
                }
                case MarkerCodes.UInt8:
                case MarkerCodes.UInt16:
                case MarkerCodes.UInt32:
                case MarkerCodes.UInt64:
                {
                    const blob = buffer.read(codeToBytesMap[code]);
                    this.children.push(blob);
                    break;
                }
                case MarkerCodes.ListEnd:
                    return;
                default:
                    throw new Error(`Invalid code ${code}`);
            }
        }
    }
}

 /**
  * TreeBuilder - Root of the tree.
  * Provides loading and serialization capabilities.
  */
export class TreeBuilder extends NodeCore {
    static load(buffer: ReadBuffer): TreeBuilder {
        const builder = new TreeBuilder();
        builder.load(buffer);
        assert(buffer.eof, "Unexpected data at the end of buffer");
        return builder;
    }

    public serialize(): ReadBuffer {
        const buffer = new WriteBuffer();
        super.serialize(buffer);
        return buffer.done();
    }
}
