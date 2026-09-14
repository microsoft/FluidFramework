/** UTF-8 encoder for string-valued FSP4 fields. */
const encoder = new TextEncoder();
/** UTF-8 decoder for diagnostic FSP4 field values. */
const decoder = new TextDecoder();
/** Fixed FSP4 header width before the encoded body. */
const headerBytes = 20;

/** FSP4 request discriminants encoded directly by the minimal driver. */
export const requestKinds = {
	create: 1,
	openSession: 2,
	submit: 3,
	latestSnapshot: 5,
	publishSnapshot: 6,
} as const;

/** Concatenates byte sequences without retaining references to the inputs. */
export function concat(...parts: readonly Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

/** Encodes an unsigned 64-bit integer in FSP4 network byte order. */
export function u64(value: bigint | number): Uint8Array {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
	return bytes;
}

/** Encodes a length-prefixed FSP4 byte field. */
export function field(value: string | Uint8Array): Uint8Array {
	const bytes = typeof value === "string" ? encoder.encode(value) : value;
	const length = new Uint8Array(4);
	new DataView(length.buffer).setUint32(0, bytes.length);
	return concat(length, bytes);
}

/** Encodes an optional length-prefixed field with its presence discriminant. */
export function optionalField(value?: Uint8Array): Uint8Array {
	return value === undefined ? new Uint8Array([0]) : concat(new Uint8Array([1]), field(value));
}

/** Encodes the initial or positioned form of an FSP4 stream reference. */
export function reference(value?: Uint8Array): Uint8Array {
	return optionalField(value);
}

/** Builds one complete version-2 FSP4 frame. */
export function frame(
	requestId: bigint,
	kind: number,
	...body: readonly Uint8Array[]
): Uint8Array {
	const payload = concat(...body);
	const header = new Uint8Array(headerBytes);
	header.set(encoder.encode("FSP4"));
	const view = new DataView(header.buffer);
	view.setUint16(4, 2);
	header[6] = kind;
	view.setBigUint64(8, requestId);
	view.setUint32(16, payload.length);
	return concat(header, payload);
}

/** The validated kind and body of one complete FSP4 frame. */
export interface ParsedFrame {
	/** Wire discriminant identifying the request or response variant. */
	readonly kind: number;
	/** Frame body after the fixed FSP4 header. */
	readonly body: Uint8Array;
}

/** Validates an FSP4 envelope and returns its kind and bounded body. */
export function parseFrame(bytes: Uint8Array): ParsedFrame {
	if (bytes.length < headerBytes || decoder.decode(bytes.slice(0, 4)) !== "FSP4") {
		throw new Error("invalid FSP4 response header");
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint16(4) !== 2 || view.getUint32(16) + headerBytes !== bytes.length) {
		throw new Error("invalid FSP4 response envelope");
	}
	return { kind: bytes[6] ?? 0, body: bytes.slice(headerBytes) };
}

/** Stateful reader for fields within a previously bounded FSP4 body. */
export class FieldReader {
	/** Offset of the next unread body byte. */
	private offset = 0;

	/** Creates a reader positioned at the first byte of the body. */
	public constructor(private readonly bytes: Uint8Array) {}

	/** Reads one byte or rejects a truncated body. */
	public byte(): number {
		const value = this.bytes[this.offset];
		if (value === undefined) {
			throw new Error("truncated FSP4 field");
		}
		this.offset++;
		return value;
	}

	/** Reads one length-prefixed field or rejects a truncated body. */
	public field(): Uint8Array {
		if (this.offset + 4 > this.bytes.length) {
			throw new Error("truncated FSP4 field length");
		}
		const length = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			4,
		).getUint32(0);
		this.offset += 4;
		const end = this.offset + length;
		if (end > this.bytes.length) {
			throw new Error("truncated FSP4 field payload");
		}
		const value = this.bytes.slice(this.offset, end);
		this.offset = end;
		return value;
	}

	/** Reads an optional field and validates its presence discriminant. */
	public optionalField(): Uint8Array | undefined {
		const discriminant = this.byte();
		if (discriminant === 0) {
			return undefined;
		}
		if (discriminant !== 1) {
			throw new Error("invalid FSP4 optional field");
		}
		return this.field();
	}
}

/** Extracts the committed position from a submitted response frame. */
export function submittedPosition(response: Uint8Array): Uint8Array {
	const parsed = parseFrame(response);
	if (parsed.kind !== 65) {
		throw new Error(`expected submitted response, received ${parsed.kind}`);
	}
	const reader = new FieldReader(parsed.body);
	reader.byte();
	return reader.field();
}

/** Extracts the summary digest from a latest-snapshot response, when one exists. */
export function latestSnapshotPayload(response: Uint8Array): Uint8Array | undefined {
	const parsed = parseFrame(response);
	if (parsed.kind !== 67) {
		throw new Error(`expected snapshot response, received ${parsed.kind}`);
	}
	const reader = new FieldReader(parsed.body);
	if (reader.byte() === 0) {
		return undefined;
	}
	reader.field();
	reader.optionalField();
	return reader.field();
}
