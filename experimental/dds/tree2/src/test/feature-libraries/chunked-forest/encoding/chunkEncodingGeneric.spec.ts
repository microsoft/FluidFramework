/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import { Static, Type } from "@sinclair/typebox";
import {
	encode,
	decode,
	handleShapesAndIdentifiers,
	IdentifierToken,
	Shape,
	ChunkEncoderLibrary,
	BufferFormat,
	NamedChunkEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/chunkEncodingGeneric";

import {
	EncodedChunkGeneric,
	unionOptions,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/formatGeneric";
import {
	Counter,
	DeduplicationTable,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/encoding/chunkEncodingUtilities";
import { ReferenceCountedBase, getOrCreate } from "../../../../util";
import { TreeChunk } from "../../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { ChunkedCursor } from "../../../../feature-libraries/chunked-forest/chunk";

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

	public encode(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<EncodedChunkShape>>,
	): EncodedChunkShape {
		return { b: this.data };
	}
}

type TestManager = Map<string, TestShape>;

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
		shapes: TestManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		const shape = getOrCreate(shapes, chunk.value, (value) => new TestShape(value));
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
		outputBuffer.push(chunk.value);
	},
};

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
		const library = new ChunkEncoderLibrary<TestManager, EncodedChunkShape>(encoder1, encoder2);

		const buffer: BufferFormat<EncodedChunkShape> = [];
		const manager: TestManager = new Map();
		const chunk = new TestChunk1("x");
		library.encode(chunk, manager, buffer);
		assert.equal(manager.size, 1);
		const shape = manager.get("x");
		assert(shape instanceof TestShape);
		assert.equal(shape.data, "x");
		assert.deepEqual(buffer, [shape]);
	});

	// TODO: finish tests
	it("encode", () => {});
	it("decode", () => {});
	it("roundtrip", () => {});
});
