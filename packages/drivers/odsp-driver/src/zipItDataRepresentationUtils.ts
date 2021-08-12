/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Data representation which is followed(zipIt Protocol) here is described in this document:
 * https://microsoft.sharepoint-df.com/:w:/t/ODSPFileStore/ER06b64K_XdDjEyAKl-UT60BJiId39SCVkYSyo_2pvH9gQ?e=KYQ0c5
*/

import { assert, IsoBuffer, Uint8ArrayToArrayBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { ReadBuffer } from "./ReadBufferUtils";

/**
 * Control codes used by tree serialization / decentralization code. Same as on server.
 */
export enum MarkerCodes {
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
export const integerBytesToCodeMap = {
    0: 1,
    1: 3,
    2: 5,
    4: 7,
    8: 9,
};

export function getAndValidateNodeProps(node: NodeCore, props: string[]) {
    const propSet = new Set(props);
    const res: Record<string, NodeTypes> = {};
    for (const [keyNode, valueNode] of node.iteratePairs()) {
        assertBlobCoreInstance(keyNode.value, keyNode.startIndex, keyNode.endIndex);
        const keyStr = keyNode.value.toString();
        assert(propSet.has(keyStr), 0x229 /* "Property should exist" */);
        propSet.delete(keyStr);
        res[keyStr] = valueNode.value;
    }
    assert(propSet.size === 0, 0x22a /* "All properties should exist" */);
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
            assert(b.done !== true, 0x22b /* "Should be a pair" */);
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
    public get arrayBuffer(): ArrayBufferLike {
        return Uint8ArrayToArrayBuffer(this.buffer);
    }

    /**
     * Represents a blob.
     * @param useUtf8Code - Represents if the utf8 string marker code should be used when representing.
     */
    constructor(public readonly useUtf8Code: boolean = false) {}

    public toString() {
        return Uint8ArrayToString(this.buffer, "utf-8");
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

export const addStringProperty = (node: NodeCore, a: string, b: string) => { node.addString(a); node.addString(b); };
export const addNumberProperty = (node: NodeCore, a: string, b: number) => { node.addString(a); node.addNumber(b); };

/**
 * Three leaf types supported by tree:
 * 1. Node (sub-tree)
 * 2. binary blob
 * 3. integer
 */
export type NodeTypes = NodeCore | BlobCore | number;

export interface INodeCoreChild {
    value: NodeTypes,
    startIndex?: number,
    endIndex?: number,
}

/**
 * Node - node in the tree (non-leaf element of the tree)
 */
export class NodeCore {
    // It is array of array of node, its startIndex and endIndex in the buffer.
    private readonly children: INodeCoreChild[] = [];
    public get nodes() {
        return this.children;
    }

    public [Symbol.iterator]() {
        return this.children[Symbol.iterator]();
    }

    public iteratePairs() {
        assert((this.length % 2) === 0, 0x22c /* "reading pairs" */);
        return iteratePairs(iterate(this));
    }

    public get length() { return this.children.length; }

    // Mostly for internal tools. Please use getString / getBlob / getNode API
    public get(index: number) { return this.children[index]; }

    public getString(index: number): string {
        const node = this.children[index];
        assertBlobCoreInstance(node.value, node.startIndex, node.endIndex);
        return node.value.toString();
    }

    public getBlob(index: number): BlobCore {
        const node = this.children[index];
        assertBlobCoreInstance(node.value, node.startIndex, node.endIndex);
        return node.value;
    }

    public getNode(index: number): NodeCore
    {
        const node = this.children[index];
        assertNodeCoreInstance(node.value, node.startIndex, node.endIndex);
        return node.value;
    }

    public getNumber(index: number): number
    {
        const node = this.children[index];
        assertNumberInstance(node.value, node.startIndex, node.endIndex);
        return node.value;
    }

    public addNode(): NodeCore {
        const node = new NodeCore();
        this.children.push({ value: node });
        return node;
    }

    public addBlob(blob: Uint8Array, useUtf8Code: boolean = false) {
        this.children.push({ value: new BlobDeepCopy(blob, useUtf8Code) });
    }

    public addString(payload: string) {
        this.addBlob(IsoBuffer.from(payload, "utf-8"), true);
    }

    public addNumber(payload: number | undefined) {
        assert(Number.isInteger(payload), 0x231 /* "Number should be an integer" */);
        assert(payload !== undefined && payload >= 0, 0x232 /* "Payload should not be negative" */);
        this.children.push({ value: payload });
    }

    /**
     * Load and parse the buffer into a tree.
     * @param buffer - buffer to read from.
     */
    protected load(buffer: ReadBuffer) {
        for (;!buffer.eof;) {
            const startIndex = buffer.pos;
            let childValue: NodeTypes | undefined;
            const code = buffer.read();
            switch (code) {
                case MarkerCodes.ListStart: {
                    childValue = new NodeCore();
                    childValue.load(buffer);
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
                    childValue = BlobShallowCopy.read(buffer, codeToBytesMap[code]);
                    break;
                }
                // If integer is 0.
                case MarkerCodes.Int0:
                {
                    childValue = 0;
                    break;
                }
                case MarkerCodes.UInt8:
                case MarkerCodes.UInt16:
                case MarkerCodes.UInt32:
                case MarkerCodes.UInt64:
                {
                    childValue = buffer.read(codeToBytesMap[code]);
                    break;
                }
                case MarkerCodes.ListEnd:
                    return;
                default:
                    throw new Error(`Invalid code: ${code}, index: ${startIndex}`);
            }
            assert(childValue !== undefined, `Child Value should be defined: startIndex: ${startIndex}`);
            this.children.push({ value: childValue, startIndex, endIndex: buffer.pos - 1});
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
        assert(buffer.eof, 0x233 /* "Unexpected data at the end of buffer" */);
        return builder;
    }
}

export function assertBlobCoreInstance(
    node: NodeTypes,
    startIndex: number | undefined,
    endIndex: number | undefined,
    message?: string,
): asserts node is BlobCore {
    if (node instanceof BlobCore) {
        return;
    }
    throwBufferParseException(node, startIndex, endIndex, message);
}

export function assertNodeCoreInstance(
    node: NodeTypes,
    startIndex: number | undefined,
    endIndex: number | undefined,
    message?: string,
): asserts node is NodeCore {
    if (node instanceof NodeCore) {
        return;
    }
    throwBufferParseException(node, startIndex, endIndex, message);
}

export function assertNumberInstance(
    node: NodeTypes,
    startIndex: number | undefined,
    endIndex: number | undefined,
    message?: string,
): asserts node is number {
    if (typeof node === "number") {
        return;
    }
    throwBufferParseException(node, startIndex, endIndex, message);
}

function throwBufferParseException(
    node: NodeTypes,
    startIndex: number | undefined,
    endIndex: number | undefined,
    message?: string,
): never {
    const error = new Error(`BufferParsingException: ${message}`);
    (error as any).startIndex = startIndex;
    (error as any).endIndex = endIndex;
    (error as any).nodeType = getNodeType(node);
    throw error;
}

function getNodeType(value: NodeTypes): string {
    if (typeof value === "number") {
        return "number";
    } else if(value instanceof BlobCore) {
        return "BlobCore";
    } else if (value instanceof NodeCore) {
        return "NodeCore";
    }
    return "unknownType";
}
