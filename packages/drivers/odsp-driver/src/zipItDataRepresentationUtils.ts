/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Data representation which is followed(zipIt Protocol) here is described in this document:
 * https://microsoft.sharepoint-df.com/:w:/t/ODSPFileStore/ER06b64K_XdDjEyAKl-UT60BJiId39SCVkYSyo_2pvH9gQ?e=KYQ0c5
*/

import { assert, IsoBuffer, Uint8ArrayToArrayBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { NonRetryableError } from "@fluidframework/driver-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { ReadBuffer } from "./ReadBufferUtils";
import { pkgVersion as driverVersion } from "./packageVersion";

// eslint-disable-next-line max-len
// https://onedrive.visualstudio.com/SharePoint%20Online/_git/SPO?path=/cobalt/Base/Property/BinaryEncodedPropertyReader.cs&version=GBmaster&_a=contents
/**
 * Control codes used by tree serialization / decentralization code. Same as on server. These can be found on
 * filestore code on server too at above link.
 */
export enum MarkerCodes {
    BoolTrue = 11,  // value = true
    BoolFalse = 12, // value = false

    StringEmpty = 13,       // value = ""
    String8Length = 14,     // unsigned-8-bit little-endian length, follows by UTF-8 bytes of length
    String16Length = 15,    // unsigned-16-bit little-endian length, follows by UTF-8 bytes of length
    String32Length = 16,    // unsigned-32-bit little-endian length, follows by UTF-8 bytes of length

    ConstString8Id = 17,     // unsigned-8-bit little-endian const string id follows
    ConstString16Id = 18,    // unsigned-16-bit little-endian const string id follows
    ConstString32Id = 19,    // unsigned-32-bit little-endian const string id follows
    ConstStringDeclare = 20, // Code for declaring a const string with size <= 1 byte
    ConstStringDeclareBig = 21, // Code for declaring a const string with size > 1 byte. It is represented in 4 bytes.

    Int0 = 1,   // value = 0
    UInt8 = 3,  // unsigned-8-bit little-endian follows
    UInt16 = 5, // unsigned-16-bit little-endian follows
    UInt32 = 7, // unsigned-32-bit little-endian follows
    UInt64 = 9, // unsigned-64-bit little-endian follows
    Int8 = 2,   // signed-8-bit little-endian follows
    Int16 = 4,  // signed-16-bit little-endian follows
    Int32 = 6,  // signed-32-bit little-endian follows
    Int64 = 8,  // signed-64-bit little-endian follows

    BinaryEmpty = 32,        // value = byte[]
    BinarySingle8 = 33,      // unsigned-8-bit little-endian length, follows by bytes of length
    BinarySingle16 = 34,     // unsigned-16-bit little-endian length, follows by bytes of length
    BinarySingle32 = 35,     // unsigned-32-bit little-endian length, follows by bytes of length
    BinarySingle64 = 36,     // unsigned-64-bit little-endian length, follows by bytes of length
}

/**
 * Control codes used by tree serialization / decentralization code. They mark the start of sections.
 */
export enum MarkerCodesStart {
    "list" = 49,
    "set" = 51,
}

/**
 * Control codes used by tree serialization / decentralization code. They mark the end of sections.
 */
export enum MarkerCodesEnd {
    "list" = 50,
    "set" = 52,
}

/**
 * This contains mapping of Marker Codes to number of bytes in which the corresponding data
 * will be stored.
*/
export const codeToBytesMap = {
    // Integer code to bytes
    1: 0,
    2: 1,
    3: 1,
    4: 2,
    5: 2,
    6: 4,
    7: 4,
    8: 8,
    9: 8,

    // String code to Bytes
    13: 0,
    14: 1,
    15: 2,
    16: 4,

    17: 1,
    18: 2,
    19: 4,

    20: 1,
    21: 4,

    // Binary code to bytes
    32: 0,
    33: 1,
    34: 2,
    35: 4,
    36: 8,
};

export function getValueSafely(map: { [index: number]: number; }, key: number) {
    const val = map[key];
    assert(val !== undefined, 0x287 /* `key= ${key} must exist in the map` */);
    return val;
}

export function getAndValidateNodeProps(node: NodeCore, props: string[], enforceAllProps = true) {
    const propSet = new Set(props);
    const res: Record<string, NodeTypes> = {};
    for (const [keyNode, valueNode] of node.iteratePairs()) {
        assertBlobCoreInstance(keyNode, "keynode should be a blob");
        const keyStr = keyNode.toString();
        if (propSet.has(keyStr)) {
            propSet.delete(keyStr);
            res[keyStr] = valueNode;
        }
    }
    if (enforceAllProps) {
        assert(propSet.size === 0, 0x288 /* `All properties should exist, Not found: ${[...propSet.keys()]}` */);
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
export function iterate<T>(obj: { [Symbol.iterator]: () => IterableIterator<T>; }) {
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
     * @param constString - Whether it contains const string declaration.
     * @param useUtf8Code - Represents if the utf8 string marker code should be used when representing.
     */
    constructor(public readonly constString: boolean, public readonly useUtf8Code: boolean = false) {}

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
     * @param constString - Whether it contains const string declaration.
     * @param useUtf8Code - Represents if the utf8 string marker code should be used when representing.
     */
    constructor(protected readonly data: Uint8Array, constString: boolean, useUtf8Code: boolean = false) {
        super(constString, useUtf8Code);
    }

    public get buffer() {
        return this.data;
    }

    public static read(buffer: ReadBuffer, lengthLen: number, constString: boolean): BlobCore {
        const length = buffer.read(lengthLen);
        const data = new Uint8Array(length);
        for (let counter = 0; counter < length; counter++) {
            data[counter] = buffer.read();
        }
        return new BlobDeepCopy(data, constString);
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
     * @param constString - Whether it contains const string declaration.
     */
    constructor(
        protected data: ReadBuffer,
        protected start: number,
        protected end: number,
        constString: boolean,
    ) {
        super(constString);
    }

    public get buffer() {
        return this.data.buffer.subarray(this.start, this.end);
    }

    public static read(buffer: ReadBuffer, lengthLen: number, constString: boolean): BlobCore {
        const length = buffer.read(lengthLen);
        const pos = buffer.pos;
        buffer.skip(length);
        return new BlobShallowCopy(buffer, pos, pos + length, constString);
    }
}

export const addStringProperty =
    (node: NodeCore, a: string, b: string, encodeValAsConstString: boolean = false) => {
        node.addString(a, true); node.addString(b, encodeValAsConstString);
    };
export const addNumberProperty = (node: NodeCore, a: string, b: number) => {
    node.addString(a, true); node.addNumber(b);
};
export const addBoolProperty = (node: NodeCore, a: string, b: boolean) => {
    node.addString(a, true); node.addBool(b);
};

/**
 * Three leaf types supported by tree:
 * 1. Node (sub-tree)
 * 2. binary blob
 * 3. integer
 * 4. boolean
 */
export type NodeTypes = NodeCore | BlobCore | number | boolean;

export type NodeCoreTypes = "list" | "set";

/**
 * Node - node in the tree (non-leaf element of the tree)
 */
export class NodeCore {
    // It is an array of nodes.
    private readonly children: NodeTypes[] = [];
    public get nodes() {
        return this.children;
    }

    constructor(public type: NodeCoreTypes = "set") {}

    public [Symbol.iterator]() {
        return this.children[Symbol.iterator]();
    }

    public iteratePairs() {
        assert((this.length % 2) === 0, 0x22c /* "reading pairs" */);
        return iteratePairs(iterate(this));
    }

    public get length() { return this.children.length; }

    public get(index: number) { return this.children[index]; }

    public getString(index: number): string {
        const node = this.children[index];
        assertBlobCoreInstance(node, "getString should return stringblob");
        return node.toString();
    }

    public getBlob(index: number): BlobCore {
        const node = this.children[index];
        assertBlobCoreInstance(node, "getBlob should return a blob");
        return node;
    }

    public getNode(index: number): NodeCore {
        const node = this.children[index];
        assertNodeCoreInstance(node, "getNode should return a node");
        return node;
    }

    public getNumber(index: number): number {
        const node = this.children[index];
        assertNumberInstance(node, "getNumber should return a number");
        return node;
    }

    public getBool(index: number): boolean {
        const node = this.children[index];
        assertBoolInstance(node, "getBool should return a boolean");
        return node;
    }

    public addNode(type?: NodeCoreTypes): NodeCore {
        const node = new NodeCore(type);
        this.children.push(node);
        return node;
    }

    public addBlob(blob: Uint8Array, constString: boolean, useUtf8Code: boolean = false) {
        this.children.push(new BlobDeepCopy(blob, constString, useUtf8Code));
    }

    public addString(payload: string, constString: boolean) {
        this.addBlob(IsoBuffer.from(payload, "utf-8"), constString, true);
    }

    public addNumber(payload: number | undefined) {
        assert(Number.isInteger(payload), 0x231 /* "Number should be an integer" */);
        assert(payload !== undefined && payload >= 0, 0x232 /* "Payload should not be negative" */);
        this.children.push(payload);
    }

    public addBool(payload: boolean) {
        this.children.push(payload);
    }

    /**
     * Load and parse the buffer into a tree.
     * @param buffer - buffer to read from.
     */
    protected load(buffer: ReadBuffer, dictionary: BlobCore[]) {
        for (;!buffer.eof;) {
            let childValue: NodeTypes | undefined;
            const code = buffer.read();
            switch (code) {
                case MarkerCodesStart.list:
                case MarkerCodesStart.set: {
                    childValue = new NodeCore(code === MarkerCodesStart.set ? "set" : "list");
                    this.children.push(childValue);
                    childValue.load(buffer, dictionary);
                    break;
                }
                case MarkerCodes.ConstStringDeclare:
                case MarkerCodes.ConstStringDeclareBig:
                {
                    const stringId = buffer.read(getValueSafely(codeToBytesMap, code));
                    const constString = BlobShallowCopy.read(buffer, getValueSafely(codeToBytesMap, code), true);
                    dictionary[stringId] = constString;
                    break;
                }
                case MarkerCodes.ConstString8Id:
                case MarkerCodes.ConstString16Id:
                case MarkerCodes.ConstString32Id:
                {
                    const stringId = buffer.read(getValueSafely(codeToBytesMap, code));
                    childValue = dictionary[stringId];
                    this.children.push(childValue);
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
                    childValue = BlobShallowCopy.read(buffer, getValueSafely(codeToBytesMap, code), false);
                    this.children.push(childValue);
                    break;
                }
                // If integer is 0.
                case MarkerCodes.Int0:
                {
                    childValue = 0;
                    this.children.push(childValue);
                    break;
                }
                case MarkerCodes.UInt8:
                case MarkerCodes.UInt16:
                case MarkerCodes.UInt32:
                case MarkerCodes.UInt64:
                case MarkerCodes.Int8:
                case MarkerCodes.Int16:
                case MarkerCodes.Int32:
                case MarkerCodes.Int64:
                {
                    childValue = buffer.read(getValueSafely(codeToBytesMap, code));
                    this.children.push(childValue);
                    break;
                }
                case MarkerCodes.BoolTrue:
                    this.children.push(true);
                    break;
                case MarkerCodes.BoolFalse:
                    this.children.push(false);
                    break;
                case MarkerCodesEnd.list:
                case MarkerCodesEnd.set:
                    return;
                default:
                    throw new Error(`Invalid code: ${code}`);
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
        const dictionary = new Array<BlobCore>();
        builder.load(buffer, dictionary);
        assert(buffer.eof, 0x233 /* "Unexpected data at the end of buffer" */);
        return builder;
    }
}

export function assertBlobCoreInstance(
    node: NodeTypes,
    message: string,
): asserts node is BlobCore {
    if (node instanceof BlobCore) {
        return;
    }
    throwBufferParseException(node, "BlobCore", message);
}

export function assertNodeCoreInstance(
    node: NodeTypes,
    message: string,
): asserts node is NodeCore {
    if (node instanceof NodeCore) {
        return;
    }
    throwBufferParseException(node, "NodeCore", message);
}

export function assertNumberInstance(
    node: NodeTypes,
    message: string,
): asserts node is number {
    if (typeof node === "number") {
        return;
    }
    throwBufferParseException(node, "Number", message);
}

export function assertBoolInstance(
    node: NodeTypes,
    message: string,
): asserts node is boolean {
    if (typeof node === "boolean") {
        return;
    }
    throwBufferParseException(node, "Boolean", message);
}

function throwBufferParseException(
    node: NodeTypes,
    expectedNodeType: NodeType,
    message: string,
): never {
    throw new NonRetryableError(
        `Buffer parsing exception: ${message}`,
        DriverErrorType.incorrectServerResponse,
        {
            nodeType: getNodeType(node),
            expectedNodeType,
            driverVersion,
        });
}

function getNodeType(value: NodeTypes): NodeType {
    if (typeof value === "number") {
        return "Number";
    } else if (value instanceof BlobCore) {
        return "BlobCore";
    } else if (value instanceof NodeCore) {
        return "NodeCore";
    } else if (typeof value === "boolean") {
        return "Boolean";
    }
    return "UnknownType";
}

type NodeType = "Number" | "BlobCore" | "NodeCore" | "Boolean" | "UnknownType";
