/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluidframework/common-utils";

/**
 * This class represents the object instatiation of the header which is optionaly writen at the
 * beginning of the binary blob. It supports conversion to / from the binary array.
 * The binary representation is as follows :
 * - HEADER ID : 16 bytes of unique identifier : f4e72832a5bd47d7a2f35ed47ed94a3c
 * - HEADER CONTENT LENGTH : 4 bytes of length of the rest of header content (after the length field)
 * - HEADER CONTENT :  HEADER CONTENT LENGTH bytes
 */
export class BlobHeader {
    public static readonly ENCODING = "utf-8";
    public static readonly HEADER_PREFIX = new Uint8Array([0xf4, 0xe7, 0x28, 0x32, 0xa5, 0xbd, 0x47, 0xd7, 0xa2
        , 0xf3, 0x5e, 0xd4, 0x7e, 0xd9, 0x4a, 0x3c]);
    constructor(private readonly _fields: { [key: string]: string; }) { }
    public getValue(key: string): string {
        return this._fields[key];
    }

    /**
     * This method returns the length of the binary representation of this header object.
     * @returns Returns the length of the binary representation of this header object.
     */
    public headerLength() {
        return this.toBinary().byteLength;
    }

    /**
     * This method converts this header object to binary array.
     * @returns this header object as binary array.
     */
    public toBinary(): IsoBuffer {
        const contentStr = JSON.stringify(this._fields);
        const contentBinary: IsoBuffer = IsoBuffer.from(contentStr, BlobHeader.ENCODING);
        const contentBinaryLength = contentBinary.byteLength;
        const contentBinaryLengthBuf = new ArrayBuffer(4);
        const view = new DataView(contentBinaryLengthBuf);
        view.setUint32(0, contentBinaryLength, false);

        return concat([BlobHeader.HEADER_PREFIX, IsoBuffer.from(contentBinaryLengthBuf), contentBinary]);
    }

    /**
     * This method converts the binary array to header object, if not present, undefined is returned.
     * @returns header object
     */
    public static fromBinary(buffer: IsoBuffer): BlobHeader | undefined {
        const possibleHeader = buffer.slice(0, BlobHeader.HEADER_PREFIX.byteLength);
        if (!isEqual(possibleHeader, BlobHeader.HEADER_PREFIX)) {
            return undefined;
        }
        const arrayBuffer = toArrayBuffer(buffer);
        const view = new DataView(arrayBuffer);
        const contentBinaryLength = view.getUint32(BlobHeader.HEADER_PREFIX.byteLength, false);
        const contentPos = BlobHeader.HEADER_PREFIX.byteLength + 4;
        const contentBinary = arrayBuffer.slice(contentPos, contentPos + contentBinaryLength);
        const contentStr = IsoBuffer.from(contentBinary).toString(BlobHeader.ENCODING);
        return new BlobHeader(JSON.parse(contentStr));
    }

    /**
     * This method returns the rest of the message cutting of the complete header from the given byte array.
     * @param buffer - The byte array
     * @returns The rest of the message cutting of the complete header from the given byte array.
     */
    public static skipHeader(buffer: IsoBuffer): IsoBuffer {
        const header = this.fromBinary(buffer);
        if (!this.fromBinary(buffer)) {
            return buffer;
        } else {
            return buffer.slice(header?.headerLength());
        }
    }
}

function toArrayBuffer(buf) {
    const ab = new ArrayBuffer(buf.length);
    const view = IsoBuffer.from(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

/**
 * This method writes the binary representation of the given header at the beginning of the given buffer.
 * @param header - The header to be written.
 * @param buffer -
 * @returns
 */
export function writeBlobHeader(header: BlobHeader, buffer: ArrayBufferLike): ArrayBufferLike {
    const binaryHeader = header.toBinary();
    const totalLength = buffer.byteLength + binaryHeader.byteLength;
    const contentBuffer = IsoBuffer.from(buffer);
    const newBuffer = concat([binaryHeader, contentBuffer], totalLength);
    return newBuffer;
}

/**
 * This function converts the binary array to header object, if not present, undefined is returned.
 * @param buffer - binary array representation of header object
 * @returns header object
 */
export function readBlobHeader(buffer: ArrayBufferLike): BlobHeader | undefined {
    return BlobHeader.fromBinary(IsoBuffer.from(buffer));
}

/**
* This method returns the rest of the message cutting of the complete header from the given byte array.
* @param buffer - The byte array
* @returns The rest of the message cutting of the complete header from the given byte array.
*/
export function skipHeader(buffer: ArrayBufferLike): ArrayBufferLike {
    return BlobHeader.skipHeader(IsoBuffer.from(buffer));
}

/**
 * This class uses the Builder pattern to generate new BlobHeader object.
 */
export class BlobHeaderBuilder {
    private readonly _fields = {};
    public addField(key: string, value: string) {
        this._fields[key] = value;
    }
    public build(): BlobHeader {
        return new BlobHeader(this._fields);
    }
}

function concat(args: IsoBuffer[], totalLength?: number) {
    let merged = args[0];
    for (let i = 1; i < args.length; i++) {
        merged = concatTwo(merged, args[i], totalLength);
    }
    return merged;
}

function concatTwo(arrayOne: IsoBuffer, arrayTwo: IsoBuffer, totalLength?: number): IsoBuffer {
    let arrayTwoReduced = arrayTwo;
    if (totalLength !== undefined) {
        if (arrayOne.length > totalLength) {
            return arrayOne.subarray(0, totalLength);
        } else if (arrayOne.length + arrayTwo.length > totalLength) {
            arrayTwoReduced = arrayTwo.subarray(0, totalLength - arrayOne.length);
        }
    }
    const mergedArray = new IsoBuffer(arrayOne.length + arrayTwo.length);
    mergedArray.set(arrayOne);
    mergedArray.set(arrayTwoReduced, arrayOne.length);
    return mergedArray;
}

function isEqual(arrayOne: IsoBuffer, arrayTwo: IsoBuffer) {
    if (arrayOne.length !== arrayTwo.length) {
        return false;
    }
    for (let i = 0; i < arrayOne.length; i++) {
        if (arrayOne[i] !== arrayTwo[i]) {
            return false;
        }
    }
    return true;
}
