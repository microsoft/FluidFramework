/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ReadBuffer } from "./ReadBufferUtils";
import {
    BlobCore,
    boolToCodeMap,
    codeToBytesMap,
    integerBytesToCodeMap,
    MarkerCodes,
    NodeCore,
    TreeBuilder,
} from "./zipItDataRepresentationUtils";

/**
 * Buffer class, used to sequentially writ data.
 * Used by tree code to serialize tree into binary representation.
 */
export class WriteBuffer {
    protected data?: Uint8Array = new Uint8Array(4096);
    protected index = 0;

    protected push(code: number) {
        assert(this.data !== undefined, 0x225 /* "Data should be there" */);
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
        assert(code === 0, 0x226 /* `Should write complete data code= ${codeArg} ${lengthArg}` */);
    }

    public done(): ReadBuffer {
        assert(this.data !== undefined, 0x227 /* "Data should be there" */);
        // We can slice it to have smaller memory representation.
        // But it will be way more expensive in terms of CPU cycles!
        const buffer = new ReadBuffer(this.data.subarray(0, this.index));
        this.data = undefined;
        return buffer;
    }
}

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
const binaryBytesToCodeMap = {
    0: 32,
    1: 33,
    2: 34,
    4: 35,
    8: 16,
};

/**
 * This contains mapping of number of bytes representing the corresponding const string id to Marker Codes.
*/
const constStringBytesToCodeMap = {
    1: 17,
    2: 18,
    4: 19,
};

/**
 * Calculate how many bytes are required to encode an integer. This is always multiple of 2.
 * So if 6 bytes are required to store an integer than it will return 8.
 * @param num - number to encode.
 */
 export function calcLength(numArg: number) {
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

function serializeBlob(buffer: WriteBuffer, blob: BlobCore, dictionary: Map<string, number>) {
    const data = blob.buffer;
    const lengthLen = calcLength(data.length);
    if (blob.constString) {
        const content = blob.toString();
        let id = dictionary.get(content);
        if (id === undefined) {
            id = dictionary.size + 1;
            dictionary.set(content, id);
            const code = lengthLen > 1 ? MarkerCodes.ConstStringDeclareBig : MarkerCodes.ConstStringDeclare;
            // Write marker code for const string.
            buffer.write(code);

            // Assign and write id for const string.
            buffer.write(id, codeToBytesMap[code]);
            // Write length of const string.
            buffer.write(data.length, codeToBytesMap[code]);
            // Write const string data.
            for (const element of data) {
                buffer.write(element);
            }
        }
        const idLength = calcLength(id);
        // Write Marker Code
        buffer.write(constStringBytesToCodeMap[idLength]);
        // Write id of const string
        buffer.write(id, idLength);
    } else {
        // Write Marker code.
        buffer.write(blob.useUtf8Code ? utf8StringBytesToCodeMap[lengthLen] : binaryBytesToCodeMap[lengthLen]);
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
 * Implementation of serialization of buffer with Marker Codes etc.
 * @param buffer - Buffer to serialize.
 */
function serializeNodeCore(buffer: WriteBuffer, nodeCore: NodeCore, dictionary: Map<string, number>) {
    for (const child of nodeCore.nodes) {
        if (child instanceof NodeCore) {
            // For a tree node start and end with set/list start and end marker codes.
            buffer.write(child.type === "set" ? MarkerCodes.SetStart : MarkerCodes.ListStart);
            serializeNodeCore(buffer, child, dictionary);
            buffer.write(child.type === "set" ? MarkerCodes.SetEnd : MarkerCodes.ListEnd);
        } else if (child instanceof BlobCore) {
            serializeBlob(buffer, child, dictionary);
        } else if (typeof child === "number") {
            // Calculate length in which integer will be stored
            const len = calcLength(child);
            // Write corresponding Marker code for length of integer.
            buffer.write(integerBytesToCodeMap[len]);
            // Write actual number if greater than 0, otherwise Marker Code is enough.
            if (len > 0) {
                buffer.write(child, len);
            }
        } else if (typeof child === "boolean") {
            buffer.write(boolToCodeMap[child ? 1 : 0]);
        }
    }
}

class NodeCoreSerializer extends NodeCore {
    constructor() {
        super();
    }

    public serialize(buffer: WriteBuffer) {
        serializeNodeCore(buffer, this, new Map<string, number>());
    }
}

export class TreeBuilderSerializer extends NodeCoreSerializer {
    constructor() {
        super();
    }

    static load(buffer: ReadBuffer): TreeBuilder {
        return TreeBuilder.load(buffer);
    }

    public serialize(): ReadBuffer {
        const buffer = new WriteBuffer();
        super.serialize(buffer);
        return buffer.done();
    }
}
