/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../../../codec/index.js";
import type {
	Counter,
	DeduplicationTable,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	IdentifierToken,
	Shape,
	handleShapesAndIdentifiers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";

export const Constant = Type.Literal(0);

export const StringShape = Type.String();

const EncodedChunkShape = Type.Object(
	{
		a: Type.Optional(Constant),
		b: Type.Optional(StringShape),
	},
	unionOptions,
);

const version = 1.0;

type Constant = Static<typeof Constant>;
type StringShape = Static<typeof StringShape>;
type EncodedChunkShape = Static<typeof EncodedChunkShape>;

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
			const input = [["x", 1, [1, 2], { a: 1, b: 2 }]];
			assert.deepEqual(handleShapesAndIdentifiers(version, input), {
				version,
				identifiers: [],
				shapes: [],
				data: input,
			});
		});
		it("identifier: inline", () => {
			assert.deepEqual(handleShapesAndIdentifiers(version, [[new IdentifierToken("x")]]), {
				version,
				identifiers: [],
				shapes: [],
				data: [["x"]],
			});
		});
		it("identifier: deduplicated", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					[new IdentifierToken("long string"), new IdentifierToken("long string")],
				]),
				{ version, identifiers: ["long string"], shapes: [], data: [[0, 0]] },
			);
		});
		it("identifier: mixed", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					[
						new IdentifierToken("long string"),
						5,
						"test string",
						new IdentifierToken("long string"),
						new IdentifierToken("used once"),
					],
				]),
				{
					version,
					identifiers: ["long string"],
					shapes: [],
					data: [[0, 5, "test string", 0, "used once"]],
				},
			);
		});
		it("shape: minimal", () => {
			assert.deepEqual(handleShapesAndIdentifiers(version, [[new TestShape("shape data")]]), {
				version,
				identifiers: [],
				shapes: [{ b: "shape data" }],
				data: [[0]],
			});
		});
		it("shape: counted", () => {
			const shape1 = new TestShape("1");
			const shape2 = new TestShape("2");
			const shape3 = new TestShape("3");
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					[shape1, shape3, shape3, shape2, shape3, shape2],
				]),
				{
					version,
					identifiers: [],
					// Ensure shapes are sorted by most frequent first
					shapes: [{ b: "3" }, { b: "2" }, { b: "1" }],
					data: [[2, 0, 0, 1, 0, 1]],
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
			assert.deepEqual(handleShapesAndIdentifiers(version, [[shape3, shape3]]), {
				version,
				identifiers: ["deduplicated-id"],
				// Ensure shapes are sorted by most frequent first
				shapes: [{ b: "3" }, { b: "2" }, { b: "1" }],
				data: [[0, 0]],
			});
		});

		it("nested arrays", () => {
			assert.deepEqual(
				handleShapesAndIdentifiers(version, [
					[[[new IdentifierToken("long string"), new IdentifierToken("long string")]]],
				]),
				{ version, identifiers: ["long string"], shapes: [], data: [[[[0, 0]]]] },
			);
		});
	});
});
