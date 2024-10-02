/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Data representation which is followed(zipIt Protocol) here is described in this document:
 * https://microsoft.sharepoint-df.com/:w:/t/ODSPFileStore/ER06b64K_XdDjEyAKl-UT60BJiId39SCVkYSyo_2pvH9gQ?e=KYQ0c5
 */

import { Uint8ArrayToArrayBuffer, Uint8ArrayToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { ReadBuffer } from "./ReadBufferUtils.js";
import { measure } from "./odspUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

// https://onedrive.visualstudio.com/SharePoint%20Online/_git/SPO?path=/cobalt/Base/Property/BinaryEncodedPropertyReader.cs&version=GBmaster&_a=contents
/**
 * Control codes used by tree serialization / decentralization code. Same as on server. These can be found on
 * filestore code on server too at above link.
 */
export enum MarkerCodes {
	BoolTrue = 11, // value = true
	BoolFalse = 12, // value = false

	StringEmpty = 13, // value = ""
	String8Length = 14, // unsigned-8-bit little-endian length, follows by UTF-8 bytes of length
	String16Length = 15, // unsigned-16-bit little-endian length, follows by UTF-8 bytes of length
	String32Length = 16, // unsigned-32-bit little-endian length, follows by UTF-8 bytes of length

	ConstString8Id = 17, // unsigned-8-bit little-endian const string id follows
	ConstString16Id = 18, // unsigned-16-bit little-endian const string id follows
	ConstString32Id = 19, // unsigned-32-bit little-endian const string id follows
	ConstStringDeclare = 20, // Code for declaring a const string with size <= 1 byte
	ConstStringDeclareBig = 21, // Code for declaring a const string with size > 1 byte. It is represented in 4 bytes.

	Int0 = 1, // value = 0
	UInt8 = 3, // unsigned-8-bit little-endian follows
	UInt16 = 5, // unsigned-16-bit little-endian follows
	UInt32 = 7, // unsigned-32-bit little-endian follows
	UInt64 = 9, // unsigned-64-bit little-endian follows
	Int8 = 2, // signed-8-bit little-endian follows
	Int16 = 4, // signed-16-bit little-endian follows
	Int32 = 6, // signed-32-bit little-endian follows
	Int64 = 8, // signed-64-bit little-endian follows

	BinaryEmpty = 32, // value = byte[]
	BinarySingle8 = 33, // unsigned-8-bit little-endian length, follows by bytes of length
	BinarySingle16 = 34, // unsigned-16-bit little-endian length, follows by bytes of length
	BinarySingle32 = 35, // unsigned-32-bit little-endian length, follows by bytes of length
	BinarySingle64 = 36, // unsigned-64-bit little-endian length, follows by bytes of length
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

export function getValueSafely(map: { [index: number]: number }, key: number): number {
	const val = map[key];
	assert(val !== undefined, 0x287 /* key must exist in the map */);
	return val;
}

export function getNodeProps(node: NodeCore): Record<string, NodeTypes> {
	const res: Record<string, NodeTypes> = {};
	for (const [keyNode, valueNode] of node.iteratePairs()) {
		const id = getStringInstance(keyNode, "keynode should be a string");
		res[id] = valueNode;
	}
	return res;
}

export function iteratePairs<T>(it: IterableIterator<T>): IterableIterator<[T, T]> {
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
		[Symbol.iterator]: () => {
			return res;
		},
	};
	return res;
}

/**
 * Helper function that returns iterator from an object
 * @param obj - object that supports iteration
 */
export function iterate<T>(obj: {
	[Symbol.iterator]: () => IterableIterator<T>;
}): IterableIterator<T> {
	return obj[Symbol.iterator]();
}

/**
 * Base class to represent binary blob element.
 * Binary blob is one of three types supported as a leaf node of a tree.
 * Note: concrete implementations (derived classes) are not exposed from this module
 */
export abstract class BlobCore {
	public abstract get buffer(): Uint8Array;
	public abstract get arrayBuffer(): ArrayBufferLike;

	/**
	 * Represents a blob.
	 */
	constructor() {}
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
	 */
	constructor(protected readonly data: Uint8Array) {
		super();
	}

	public get buffer(): Uint8Array {
		return this.data;
	}

	public get arrayBuffer(): ArrayBufferLike {
		return Uint8ArrayToArrayBuffer(this.buffer);
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
	constructor(
		protected data: Uint8Array,
		protected start: number,
		protected end: number,
	) {
		super();
	}

	public get buffer(): Uint8Array {
		return this.data.subarray(this.start, this.end);
	}

	// Equivalent to Uint8ArrayToArrayBuffer(this.buffer)
	public get arrayBuffer(): ArrayBufferLike {
		const offset = this.data.byteOffset;
		return this.data.buffer.slice(this.start + offset, this.end + offset);
	}

	public static read(buffer: ReadBuffer, lengthLen: number): BlobCore {
		const length = buffer.read(lengthLen);
		const pos = buffer.pos;
		buffer.skip(length);
		return new BlobShallowCopy(buffer.buffer, pos, pos + length);
	}
}

export const addStringProperty = (node: NodeCore, a: string, b: string): void => {
	node.addDictionaryString(a);
	node.addString(b);
};
export const addDictionaryStringProperty = (node: NodeCore, a: string, b: string): void => {
	node.addDictionaryString(a);
	node.addString(b);
};
export const addNumberProperty = (node: NodeCore, a: string, b: number): void => {
	node.addDictionaryString(a);
	node.addNumber(b);
};
export const addBoolProperty = (node: NodeCore, a: string, b: boolean): void => {
	node.addDictionaryString(a);
	node.addBool(b);
};

export interface IStringElement {
	content: string;
	dictionary: boolean;
	_stringElement: true;
}

export interface IStringElementInternal extends Omit<IStringElement, "content"> {
	content?: string;
	startPos: number;
	endPos: number;
}

/**
 * Three leaf types supported by tree:
 * 1. Node (sub-tree)
 * 2. binary blob
 * 3. integer
 * 4. boolean
 */
export type NodeTypes = NodeCore | BlobCore | number | boolean | IStringElement;

export type NodeCoreTypes = "list" | "set";

/**
 * Node - node in the tree (non-leaf element of the tree)
 */
export class NodeCore {
	// It is an array of nodes.
	private readonly children: NodeTypes[] = [];
	public get nodes(): NodeTypes[] {
		return this.children;
	}

	constructor(public type: NodeCoreTypes = "set") {}

	public [Symbol.iterator](): IterableIterator<NodeTypes> {
		return this.children[Symbol.iterator]();
	}

	public iteratePairs(): IterableIterator<[NodeTypes, NodeTypes]> {
		assert(this.length % 2 === 0, 0x22c /* "reading pairs" */);
		return iteratePairs(iterate(this));
	}

	public get length(): number {
		return this.children.length;
	}

	public get(index: number): NodeTypes {
		return this.children[index];
	}

	public getString(index: number): string {
		const node = this.children[index];
		return getStringInstance(node, "getString should return string");
	}

	public getMaybeString(index: number): string | undefined {
		const node = this.children[index];
		return getMaybeStringInstance(node);
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

	public addBlob(blob: Uint8Array): void {
		this.children.push(new BlobDeepCopy(blob));
	}

	public addDictionaryString(payload: string): void {
		this.children.push({
			content: payload,
			dictionary: true,
			_stringElement: true,
		});
	}

	public addString(payload: string): void {
		this.children.push({
			content: payload,
			dictionary: false,
			_stringElement: true,
		});
	}

	public addNumber(payload: number | undefined): void {
		assert(Number.isInteger(payload), 0x231 /* "Number should be an integer" */);
		assert(
			payload !== undefined && payload >= 0,
			0x232 /* "Payload should not be negative" */,
		);
		this.children.push(payload);
	}

	public addBool(payload: boolean): void {
		this.children.push(payload);
	}

	// Can we do more efficiently here, without extra objects somehow??
	private static readString(
		buffer: ReadBuffer,
		code: number,
		dictionary: boolean,
	): IStringElementInternal & IStringElement {
		const lengthLen = getValueSafely(codeToBytesMap, code);
		const length = buffer.read(lengthLen);
		const startPos = buffer.pos;
		buffer.skip(length);
		const result: IStringElementInternal = {
			// Note: Setting here property 'content: undefined' makes code substantially slower!
			dictionary,
			_stringElement: true,
			startPos,
			endPos: buffer.pos,
		};

		// We are lying here in terms of presence of `content` property.
		// This will be addressed at the bottom of NodeCore.load() by resolving all strings at once!
		// It's equivalent (but much slower!) to do it here via
		// result.content = Uint8ArrayToString(buffer.buffer.subarray(startPos, buffer.pos), "utf-8");
		return result as IStringElementInternal & IStringElement;
	}

	/**
	 * Load and parse the buffer into a tree.
	 * @param buffer - buffer to read from.
	 */
	protected load(
		buffer: ReadBuffer,
		logger: ITelemetryLoggerExt,
	): {
		durationStructure: number;
		durationStrings: number;
	} {
		const [stringsToResolve, durationStructure] = measure(() =>
			this.loadStructure(buffer, logger),
		);
		const [, durationStrings] = measure(() =>
			this.loadStrings(buffer, stringsToResolve, logger),
		);
		return { durationStructure, durationStrings };
	}

	/**
	 * Load and parse the buffer into a tree.
	 * @param buffer - buffer to read from.
	 */
	protected loadStructure(
		buffer: ReadBuffer,
		logger: ITelemetryLoggerExt,
	): IStringElementInternal[] {
		const stack: NodeTypes[][] = [];
		const stringsToResolve: IStringElementInternal[] = [];
		const dictionary: IStringElement[] = [];

		let children = this.children;
		for (; !buffer.eof; ) {
			const code = buffer.read();
			switch (code) {
				case MarkerCodesStart.list:
				case MarkerCodesStart.set: {
					const childValue = new NodeCore(code === MarkerCodesStart.set ? "set" : "list");
					children.push(childValue);
					stack.push(children);
					children = childValue.children;
					continue;
				}
				case MarkerCodes.ConstStringDeclare:
				case MarkerCodes.ConstStringDeclareBig: {
					const stringId = buffer.read(getValueSafely(codeToBytesMap, code));
					const constString = NodeCore.readString(buffer, code, true /* dictionary */);
					stringsToResolve.push(constString);
					dictionary[stringId] = constString;
					continue;
				}
				case MarkerCodes.ConstString8Id:
				case MarkerCodes.ConstString16Id:
				case MarkerCodes.ConstString32Id: {
					const stringId = buffer.read(getValueSafely(codeToBytesMap, code));
					const content = dictionary[stringId];
					assert(content !== undefined, 0x3de /* const string not found */);
					children.push(content);
					continue;
				}
				case MarkerCodes.StringEmpty:
				case MarkerCodes.String8Length:
				case MarkerCodes.String16Length:
				case MarkerCodes.String32Length: {
					const str = NodeCore.readString(buffer, code, false /* dictionary */);
					stringsToResolve.push(str);
					children.push(str);
					continue;
				}
				case MarkerCodes.BinaryEmpty:
				case MarkerCodes.BinarySingle8:
				case MarkerCodes.BinarySingle16:
				case MarkerCodes.BinarySingle32:
				case MarkerCodes.BinarySingle64: {
					children.push(BlobShallowCopy.read(buffer, getValueSafely(codeToBytesMap, code)));
					continue;
				}
				// If integer is 0.
				case MarkerCodes.Int0: {
					children.push(0);
					continue;
				}
				case MarkerCodes.UInt8:
				case MarkerCodes.UInt16:
				case MarkerCodes.UInt32:
				case MarkerCodes.UInt64:
				case MarkerCodes.Int8:
				case MarkerCodes.Int16:
				case MarkerCodes.Int32:
				case MarkerCodes.Int64: {
					children.push(buffer.read(getValueSafely(codeToBytesMap, code)));
					continue;
				}
				case MarkerCodes.BoolTrue: {
					children.push(true);
					continue;
				}
				case MarkerCodes.BoolFalse: {
					children.push(false);
					continue;
				}
				case MarkerCodesEnd.list:
				case MarkerCodesEnd.set: {
					// Note: We are not checking that end marker matches start marker.
					// I.e. that we do not have a case where we start a 'list' but end with a 'set'
					// Checking it would require more state tracking that seems not very useful, given
					// our code does not care.
					children = stack.pop()!;

					// To my surprise, checking children !== undefined adds measurable cost!
					// We will rely on children.push() crashing in case of mismatch, and check below
					// (outside of the loop)
					continue;
				}
				default: {
					throw new Error(`Invalid code: ${code}`);
				}
			}
		}

		// This also ensures that stack.length === 0.
		assert(children === this.children, 0x3e7 /* Unpaired start/end list/set markers! */);

		return stringsToResolve;
	}

	private loadStrings(
		buffer: ReadBuffer,
		stringsToResolve: IStringElementInternal[],
		logger: ITelemetryLoggerExt,
	): void {
		/**
		 * Process all the strings at once!
		 */
		let length = 0;
		for (const el of stringsToResolve) {
			length += el.endPos - el.startPos + 1;
		}
		const stringBuffer = new Uint8Array(length);

		length = 0;
		const input = buffer.buffer;
		assert(input.byteOffset === 0, 0x3e8 /* code below assumes no offset */);

		for (const el of stringsToResolve) {
			for (let it = el.startPos; it < el.endPos; it++) {
				stringBuffer[length] = input[it];
				length++;
			}
			stringBuffer[length] = 0;
			length++;
		}
		assert(length === stringBuffer.length, 0x418 /* properly encoded */);

		const result = Uint8ArrayToString(stringBuffer, "utf8").split(String.fromCodePoint(0));
		if (result.length === stringsToResolve.length + 1) {
			// All is good, we expect all the cases to get here
			for (let i = 0; i < stringsToResolve.length; i++) {
				stringsToResolve[i].content = result[i];
			}
		} else {
			// String content has \0 chars!
			// Recovery code
			logger.sendErrorEvent({ eventName: "StringParsingError" });
			for (const el of stringsToResolve) {
				assert(
					el.content === Uint8ArrayToString(input.subarray(el.startPos, el.endPos), "utf8"),
					0x3ea /* test */,
				);
			}
		}
	}
}

/**
 * TreeBuilder - Root of the tree.
 * Provides loading and serialization capabilities.
 */
export class TreeBuilder extends NodeCore {
	static load(
		buffer: ReadBuffer,
		logger: ITelemetryLoggerExt,
	): {
		builder: TreeBuilder;
		telemetryProps: {
			durationStructure: number;
			durationStrings: number;
		};
	} {
		const builder = new TreeBuilder();
		const telemetryProps = builder.load(buffer, logger);
		assert(buffer.eof, 0x233 /* "Unexpected data at the end of buffer" */);
		return { builder, telemetryProps };
	}
}

export function getMaybeStringInstance(node: NodeTypes): string | undefined {
	const maybeString = node as IStringElement;
	if (maybeString._stringElement) {
		return maybeString.content;
	}
}

export function getStringInstance(node: NodeTypes, message: string): string {
	const maybeString = node as IStringElement;
	if (maybeString._stringElement) {
		return maybeString.content;
	}
	throwBufferParseException(node, "BlobCore", message);
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

export function assertBoolInstance(node: NodeTypes, message: string): asserts node is boolean {
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
		OdspErrorTypes.incorrectServerResponse,
		{
			nodeType: getNodeType(node),
			expectedNodeType,
			driverVersion,
		},
	);
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
	} else if (value._stringElement) {
		return "String";
	}
	return "UnknownType";
}

type NodeType = "Number" | "BlobCore" | "NodeCore" | "Boolean" | "UnknownType" | "String";
