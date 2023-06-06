/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Static, Type } from "@sinclair/typebox";
import {
	encode,
	decode,
	handleShapesAndIdentifiers,
	IdentifierToken,
	Shape,
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

export const Constant = Type.Literal(0);

export const StringShape = Type.String();

const EncodedChunkShape = Type.Object(
	{
		a: Type.Optional(Constant),
		b: Type.Optional(StringShape),
	},
	unionOptions,
);

type Constant = Static<typeof Constant>;
type StringShape = Static<typeof StringShape>;
type EncodedChunkShape = Static<typeof EncodedChunkShape>;

const EncodedChunk = EncodedChunkGeneric(EncodedChunkShape);
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

describe("chunkEncodingGeneric", () => {
	describe("handleShapesAndIdentifiers", () => {
		it("Empty", () => {
			assert.deepEqual(handleShapesAndIdentifiers([]), {
				identifiers: [],
				shapes: [],
				data: [],
			});
		});
		it("data", () => {
			const input = ["x", 1, [1, 2], { a: 1, b: 2 }];
			assert.deepEqual(handleShapesAndIdentifiers(input), {
				identifiers: [],
				shapes: [],
				data: input,
			});
		});
		it("identifier: inline", () => {
			assert.deepEqual(handleShapesAndIdentifiers([new IdentifierToken("x")]), {
				identifiers: [],
				shapes: [],
				data: ["x"],
			});
		});
		it("identifier: deduplicated", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers([
					new IdentifierToken("long string"),
					new IdentifierToken("long string"),
				]),
				{
					identifiers: ["long string"],
					shapes: [],
					data: [0, 0],
				},
			);
		});
		it("identifier: mixed", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers([
					new IdentifierToken("long string"),
					5,
					"test string",
					new IdentifierToken("long string"),
					new IdentifierToken("used once"),
				]),
				{
					identifiers: ["long string"],
					shapes: [],
					data: [0, 5, "test string", 0, "used once"],
				},
			);
		});
		it("shape: minimal", () => {
			assert.deepEqual(handleShapesAndIdentifiers([new TestShape("shape data")]), {
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
				handleShapesAndIdentifiers([shape1, shape3, shape3, shape2, shape3, shape2]),
				{
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
			assert.deepEqual(handleShapesAndIdentifiers([shape3, shape3]), {
				identifiers: ["deduplicated-id"],
				// Ensure shapes are sorted by most frequent first
				shapes: [{ b: "3" }, { b: "2" }, { b: "1" }],
				data: [0, 0],
			});
		});
	});

	// TODO: finish tests
	describe("ChunkEncoderLibrary", () => {
		it("Usage", () => {});
	});
	it("encode", () => {});
	it("decode", () => {});
	it("roundtrip", () => {});
});
