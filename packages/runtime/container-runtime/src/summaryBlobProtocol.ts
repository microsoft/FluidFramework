/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * This class represents the object instatiation of the header which is optionaly writen at the
 * beginning of the binary blob. It supports conversion to / from the binary array.
 * The binary representation is as follows :
 * - HEADER ID : 16 bytes of unique identifier : f4e72832a5bd47d7a2f35ed47ed94a3c
 * - HEADER CONTENT LENGTH : 4 bytes of length of the rest of header content (after the length field)
 * - HEADER CONTENT :  HEADER CONTENT LENGTH bytes
 */
export class BlobHeader {
    public static readonly ENCODING = "ascii";
    public static readonly HEADER_PREFIX = Buffer.from("f4e72832a5bd47d7a2f35ed47ed94a3c", "hex");
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
    public toBinary(): Buffer {
        const contentStr = JSON.stringify(this._fields);
        const contentBinary: Buffer = Buffer.from(contentStr, BlobHeader.ENCODING);
        const contentBinaryLength = contentBinary.byteLength;
        const contentBinaryLengthBuf = new ArrayBuffer(4);
        const view = new DataView(contentBinaryLengthBuf);
        view.setUint32(0, contentBinaryLength, false);
        return Buffer.concat([BlobHeader.HEADER_PREFIX, Buffer.from(contentBinaryLengthBuf), contentBinary]);
    }

    /**
     * This method converts the binary array to header object, if not present, undefined is returned.
     * @returns header object
     */
    public static fromBinary(buffer: Buffer): BlobHeader | undefined {
        const possibleHeader = buffer.slice(0, BlobHeader.HEADER_PREFIX.byteLength);
        if (!possibleHeader.equals(BlobHeader.HEADER_PREFIX)) {
            return undefined;
        }
        const arrayBuffer = toArrayBuffer(buffer);
        const view = new DataView(arrayBuffer);
        const contentBinaryLength = view.getUint32(BlobHeader.HEADER_PREFIX.byteLength, false);
        const contentPos = BlobHeader.HEADER_PREFIX.byteLength + 4;
        const contentBinary = arrayBuffer.slice(contentPos, contentPos + contentBinaryLength);
        const contentStr = Buffer.from(contentBinary).toString(BlobHeader.ENCODING);
        return new BlobHeader(JSON.parse(contentStr));
    }

    /**
     * This method returns the rest of the message cutting of the complete header from the given byte array.
     * @param buffer - The byte array
     * @returns The rest of the message cutting of the complete header from the given byte array.
     */
    public static skipHeader(buffer: Buffer): Buffer {
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
    const view = new Uint8Array(ab);
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
    const contentBuffer = Buffer.from(buffer);
    const newBuffer = Buffer.concat([binaryHeader, contentBuffer], totalLength);
    return newBuffer;
}

/**
 * This function converts the binary array to header object, if not present, undefined is returned.
 * @param buffer - binary array representation of header object
 * @returns header object
 */
export function readBlobHeader(buffer: ArrayBufferLike): BlobHeader | undefined {
    return BlobHeader.fromBinary(Buffer.from(buffer));
}

/**
* This method returns the rest of the message cutting of the complete header from the given byte array.
* @param buffer - The byte array
* @returns The rest of the message cutting of the complete header from the given byte array.
*/
export function skipHeader(buffer: ArrayBufferLike): ArrayBufferLike {
    return BlobHeader.skipHeader(Buffer.from(buffer));
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
