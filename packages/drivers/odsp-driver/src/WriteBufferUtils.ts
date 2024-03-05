/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import {
	BlobCore,
	codeToBytesMap,
	getValueSafely,
	MarkerCodes,
	MarkerCodesEnd,
	MarkerCodesStart,
	NodeCore,
} from "./zipItDataRepresentationUtils.js";

/**
 * Buffer class, used to sequentially writ data.
 * Used by tree code to serialize tree into binary representation.
 */
export class WriteBuffer {
	protected data?: Uint8Array = new Uint8Array(4096);
	protected index = 0;

	protected push(code: number): void {
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

	public write(codeArg: number, lengthArg = 1): void {
		let code = codeArg;
		let length = lengthArg;
		while (length > 0) {
			this.push(code % 256);
			code = Math.floor(code / 256);
			length--;
		}
		assert(code === 0, 0x226 /* Should write complete data */);
	}

	public done(): Uint8Array {
		assert(this.data !== undefined, 0x227 /* "Data should be there" */);
		// We can slice it to have smaller memory representation.
		// But it will be way more expensive in terms of CPU cycles!
		const buffer = this.data.subarray(0, this.index);
		this.data = undefined;
		return buffer;
	}
}

// This list of maps below is reverse mapping of Marker Codes specified in zipItDataRepresentationUtils.ts file.
// We can also found them on server filestore code.
// https://onedrive.visualstudio.com/SharePoint%20Online/_git/SPO?path=/cobalt/Base/Property/BinaryEncodedPropertyReader.cs&version=GBmaster&_a=contents

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
 * This contains mapping of boolean to Marker Codes representing the corresponding bool value.
 */
const boolToCodeMap = [
	12, // false
	11, // true
];

/**
 * Calculate how many bytes are required to encode an integer. This is always power of 2.
 * So if 6 bytes are required to store an integer than it will return 8. 0 is a special case for which we
 * return 0 as it is usually just represented by marker code and we don't store the actual data.
 * @param num - number to encode.
 */
export function calcLength(numArg: number): number {
	if (numArg === 0) {
		return 0;
	}
	let num = numArg;
	let lengthLen = 0;
	while (num > 0) {
		num = Math.floor(num / 256);
		lengthLen++;
	}
	let res = 1;
	while (res < lengthLen) {
		res *= 2;
	}
	return res;
}

/**
 * Implementation of serialization of blobs in buffer with Marker Codes etc.
 * @param buffer - Buffer to serialize to.
 * @param content - string to be serialized.
 * @param dictionary - Const strings dictionary to be used while serializing.
 */
function serializeDictionaryString(
	buffer: WriteBuffer,
	content: string,
	dictionary: Map<string, number>,
): void {
	let id = dictionary.get(content);
	let idLength: number;
	if (id === undefined) {
		const data = IsoBuffer.from(content, "utf8");
		const lengthOfDataLen = calcLength(data.length);

		id = dictionary.size + 1;
		idLength = calcLength(id);
		dictionary.set(content, id);
		const code =
			lengthOfDataLen > 1 || idLength > 1
				? MarkerCodes.ConstStringDeclareBig
				: MarkerCodes.ConstStringDeclare;
		// Write marker code for const string.
		buffer.write(code);
		const bytes = getValueSafely(codeToBytesMap, code);
		assert(
			bytes >= lengthOfDataLen,
			0x283 /* "Length of data len should fit in the bytes from the map" */,
		);
		assert(bytes >= idLength, 0x284 /* "Length of id should fit in the bytes from the map" */);
		// Assign and write id for const string.
		buffer.write(id, bytes);
		// Write length of const string.
		buffer.write(data.length, bytes);
		// Write const string data.
		for (const element of data) {
			buffer.write(element);
		}
	} else {
		idLength = calcLength(id);
	}
	// Write Marker Code
	buffer.write(getValueSafely(constStringBytesToCodeMap, idLength));
	// Write id of const string
	buffer.write(id, idLength);
}

function serializeString(
	buffer: WriteBuffer,
	content: string,
	codeMap = binaryBytesToCodeMap,
): void {
	serializeBlob(buffer, IsoBuffer.from(content, "utf8"), utf8StringBytesToCodeMap);
}

/**
 * Implementation of serialization of blobs in buffer with Marker Codes etc.
 * @param buffer - Buffer to serialize to.
 * @param blob - blob to be serialized.
 * @param dictionary - Const strings dictionary to be used while serializing.
 */
function serializeBlob(
	buffer: WriteBuffer,
	data: Uint8Array,
	codeMap: Record<number, number> = binaryBytesToCodeMap,
): void {
	const lengthOfDataLen = calcLength(data.length);
	// Write Marker code.
	buffer.write(getValueSafely(codeMap, lengthOfDataLen));
	// Write actual data if length greater than 0, otherwise Marker Code is enough.
	if (lengthOfDataLen > 0) {
		buffer.write(data.length, lengthOfDataLen);
		for (const element of data) {
			buffer.write(element);
		}
	}
}

/**
 * Implementation of serialization of nodes with Marker Codes etc.
 * @param buffer - Buffer to serialize to.
 * @param nodeCore - Node to be serialized.
 * @param dictionary - Const strings dictionary to be used while serializing.
 */
function serializeNodeCore(
	buffer: WriteBuffer,
	nodeCore: NodeCore,
	dictionary: Map<string, number>,
): void {
	for (const child of nodeCore.nodes) {
		if (child instanceof NodeCore) {
			// For a tree node start and end with set/list start and end marker codes.
			const startCode = MarkerCodesStart[child.type];
			const endCode = MarkerCodesEnd[child.type];
			assert(startCode !== undefined, 0x285 /* "Start code should not undefined" */);
			assert(endCode !== undefined, 0x286 /* "End code should not undefined" */);
			buffer.write(startCode);
			serializeNodeCore(buffer, child, dictionary);
			buffer.write(endCode);
		} else if (child instanceof BlobCore) {
			serializeBlob(buffer, child.buffer);
		} else if (typeof child === "number") {
			// Calculate length in which integer will be stored
			const len = calcLength(child);
			// Write corresponding Marker code for length of integer.
			buffer.write(getValueSafely(integerBytesToCodeMap, len));
			// Write actual number if greater than 0, otherwise Marker Code is enough.
			if (len > 0) {
				buffer.write(child, len);
			}
		} else if (typeof child === "boolean") {
			buffer.write(boolToCodeMap[child ? 1 : 0]);
		} else {
			assert(child._stringElement, 0x3dd /* Unsupported node type */);
			if (child.dictionary) {
				serializeDictionaryString(buffer, child.content, dictionary);
			} else {
				serializeString(buffer, child.content);
			}
		}
	}
}

class NodeCoreSerializer extends NodeCore {
	constructor() {
		super();
	}

	public serialize(buffer: WriteBuffer): void {
		serializeNodeCore(buffer, this, new Map<string, number>());
	}
}

export class TreeBuilderSerializer extends NodeCoreSerializer {
	constructor() {
		super();
	}

	public serialize(): Uint8Array {
		const buffer = new WriteBuffer();
		super.serialize(buffer);
		return buffer.done();
	}
}
