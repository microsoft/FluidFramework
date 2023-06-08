/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import { Static, Type } from "@sinclair/typebox";
import {
	encode,
	handleShapesAndIdentifiers,
	IdentifierToken,
	Shape,
	ChunkEncoderLibrary,
	BufferFormat,
	NamedChunkEncoder,
	decode,
	EncoderCache,
	encoderCacheSlot,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/chunkEncodingGeneric";

import {
	EncodedChunkGeneric,
	unionOptions,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/formatGeneric";
import {
	ChunkDecoder,
	Counter,
	DeduplicationTable,
	DiscriminatedUnionDispatcher,
	readStreamNumber,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/chunkEncodingUtilities";
import { ReferenceCountedBase, getOrCreate, getOrCreateSlot } from "../../../../util";
import { TreeChunk } from "../../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { ChunkedCursor } from "../../../../feature-libraries/chunked-forest/chunk";
// eslint-disable-next-line import/no-internal-modules
import { emptyChunk } from "../../../../feature-libraries/chunked-forest/emptyChunk";

export const Constant = Type.Literal(0);

export const StringShape = Type.String();

const EncodedChunkShape = Type.Object(
	{
		a: Type.Optional(Constant),
		b: Type.Optional(StringShape),
	},
	unionOptions,
);

const version = "test format";

type Constant = Static<typeof Constant>;
type StringShape = Static<typeof StringShape>;
type EncodedChunkShape = Static<typeof EncodedChunkShape>;

const EncodedChunk = EncodedChunkGeneric(version, EncodedChunkShape);
type EncodedChunk = Static<typeof EncodedChunk>;

class TestShape extends Shape<EncodedChunkShape> {
	public constructor(
		public readonly data: string,
		public readonly count: (
			identifiers: Counter<string>,
			shapes: (shape: Shape<EncodedChunkShape>) => void,
		) => void = () => {},
	) {
		super();
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return { b: this.data };
	}
}

class TestConstantShape extends Shape<EncodedChunkShape> {
	public constructor() {
		super();
	}

	public count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<EncodedChunkShape>) => void,
	): void {}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return { a: 0 };
	}
}

const testConstantShape = new TestConstantShape();

type TestManager = EncoderCache;

const shapeSlot = encoderCacheSlot<Map<string, TestShape>>();

class TestChunk1 extends ReferenceCountedBase implements TreeChunk {
	public readonly topLevelLength: number = 1;

	public constructor(public value: string) {
		super();
	}

	public clone(): TestChunk1 {
		return new TestChunk1(this.value);
	}

	public cursor(): ChunkedCursor {
		fail("not implemented");
	}

	protected dispose(): void {}
}

class TestChunk2 extends ReferenceCountedBase implements TreeChunk {
	public readonly topLevelLength: number = 1;

	public constructor(public value: number) {
		super();
	}

	public clone(): TestChunk2 {
		return new TestChunk2(this.value);
	}

	public cursor(): ChunkedCursor {
		fail("not implemented");
	}

	protected dispose(): void {}
}

const encoder1: NamedChunkEncoder<TestManager, EncodedChunkShape, TestChunk1> = {
	type: TestChunk1,
	encode(
		chunk: TestChunk1,
		cache: TestManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		const shapeCache = getOrCreateSlot(cache, shapeSlot, () => new Map());
		const shape = getOrCreate(shapeCache, chunk.value, (value) => new TestShape(value));
		outputBuffer.push(shape);
	},
};
const encoder2: NamedChunkEncoder<TestManager, EncodedChunkShape, TestChunk2> = {
	type: TestChunk2,
	encode(
		chunk: TestChunk2,
		shapes: TestManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		outputBuffer.push(testConstantShape);
		outputBuffer.push(chunk.value);
	},
};

const encodeLibrary = new ChunkEncoderLibrary<TestManager, EncodedChunkShape>(encoder1, encoder2);

type DecoderSharedCache = 0;

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderSharedCache],
	ChunkDecoder
>({
	a(shape: Constant, cache): ChunkDecoder {
		return {
			decode(decoders, stream): TreeChunk {
				return new TestChunk2(readStreamNumber(stream));
			},
		};
	},
	b(shape: StringShape, cache): ChunkDecoder {
		return {
			decode(decoders, stream): TreeChunk {
				return new TestChunk1(shape);
			},
		};
	},
});

describe("chunkEncodingGeneric", () => {
	describe("handleShapesAndIdentifiers", () => {
		it("Empty", () => {
			assert.deepEqual(handleShapesAndIdentifiers(version, []), {
				version,
				identifiers: [],
				shapes: [],
				data: [],
			});
		});
		it("data", () => {
			const input = ["x", 1, [1, 2], { a: 1, b: 2 }];
			assert.deepEqual(handleShapesAndIdentifiers(version, input), {
				version,
				identifiers: [],
				shapes: [],
				data: input,
			});
		});
		it("identifier: inline", () => {
			assert.deepEqual(handleShapesAndIdentifiers(version, [new IdentifierToken("x")]), {
				version,
				identifiers: [],
				shapes: [],
				data: ["x"],
			});
		});
		it("identifier: deduplicated", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					new IdentifierToken("long string"),
					new IdentifierToken("long string"),
				]),
				{ version, identifiers: ["long string"], shapes: [], data: [0, 0] },
			);
		});
		it("identifier: mixed", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					new IdentifierToken("long string"),
					5,
					"test string",
					new IdentifierToken("long string"),
					new IdentifierToken("used once"),
				]),
				{
					version,
					identifiers: ["long string"],
					shapes: [],
					data: [0, 5, "test string", 0, "used once"],
				},
			);
		});
		it("shape: minimal", () => {
			assert.deepEqual(handleShapesAndIdentifiers(version, [new TestShape("shape data")]), {
				version,
				identifiers: [],
				shapes: [{ b: "shape data" }],
				data: [0],
			});
		});
		it("shape: counted", () => {
			const shape1 = new TestShape("1");
			const shape2 = new TestShape("2");
			const shape3 = new TestShape("3");
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					shape1,
					shape3,
					shape3,
					shape2,
					shape3,
					shape2,
				]),
				{
					version,
					identifiers: [],
					// Ensure shapes are sorted by most frequent first
					shapes: [{ b: "3" }, { b: "2" }, { b: "1" }],
					data: [2, 0, 0, 1, 0, 1],
				},
			);
		});
		it("shape: references and counting", () => {
			const shape1 = new TestShape("1", (identifier, countShape) => {
				identifier.add("inline-id");
				identifier.add("deduplicated-id", 5);
			});
			const shape2 = new TestShape("2", (identifier, countShape) => {
				countShape(shape1);
			});
			const shape3 = new TestShape("3", (identifier, countShape) => {
				countShape(shape2);
				countShape(shape3); // cycle
			});
			assert.deepEqual(handleShapesAndIdentifiers(version, [shape3, shape3]), {
				version,
				identifiers: ["deduplicated-id"],
				// Ensure shapes are sorted by most frequent first
				shapes: [{ b: "3" }, { b: "2" }, { b: "1" }],
				data: [0, 0],
			});
		});
	});

	it("ChunkEncoderLibrary", () => {
		const buffer: BufferFormat<EncodedChunkShape> = [];
		const manager: TestManager = new Map();
		const chunk = new TestChunk1("x");
		encodeLibrary.encode(chunk, manager, buffer);
		const shapeCache = manager.get(shapeSlot) ?? fail();
		assert.equal(shapeCache.size, 1);
		const shape = shapeCache.get("x");
		assert(shape instanceof TestShape);
		assert.equal(shape.data, "x");
		assert.deepEqual(buffer, [shape]);
	});

	it("encode: empty", () => {
		const manager: TestManager = new Map();
		const encoded = encode(version, encodeLibrary, manager, emptyChunk);
		assert.deepEqual(encoded, {
			version,
			identifiers: [],
			shapes: [],
			data: [],
		});
	});

	it("encode: constant shape", () => {
		const manager: TestManager = new Map();
		const chunk = new TestChunk2(5);
		const encoded = encode(version, encodeLibrary, manager, chunk);
		assert.deepEqual(encoded, {
			version,
			identifiers: [],
			shapes: [{ a: 0 }],
			data: [0, 5],
		});
	});

	it("encode: flexible shape", () => {
		const manager: TestManager = new Map();
		const chunk = new TestChunk1("content");
		const encoded = encode(version, encodeLibrary, manager, chunk);
		assert.deepEqual(encoded, {
			version,
			identifiers: [],
			shapes: [{ b: "content" }],
			data: [0],
		});
	});

	it("decode: constant shape", () => {
		const chunk = decode(decoderLibrary, 0, {
			version,
			identifiers: [],
			shapes: [{ a: 0 }],
			data: [0, 5],
		});
		assert(chunk instanceof TestChunk2);
		assert.equal(chunk.value, 5);
	});

	it("decode: flexible shape", () => {
		const chunk = decode(decoderLibrary, 0, {
			version,
			identifiers: [],
			shapes: [{ b: "content" }],
			data: [0],
		});
		assert(chunk instanceof TestChunk1);
		assert.equal(chunk.value, "content");
	});
});
