/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { type Static, Type } from "@sinclair/typebox";

import { DiscriminatedUnionDispatcher, unionOptions } from "../../../../codec/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { ChunkedCursor } from "../../../../core/index.js";
import {
	type ChunkDecoder,
	type StreamCursor,
	getChecked,
	readStreamNumber,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	DecoderContext,
	decode,
	readStreamIdentifier,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkDecodingGeneric.js";
import {
	EncodedFieldBatchGeneric,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/formatGeneric.js";
import type { TreeChunk } from "../../../../feature-libraries/index.js";
import { ReferenceCountedBase } from "../../../../util/index.js";
import { testIdCompressor } from "../../../utils.js";

const Constant = Type.Literal(0);
const StringShape = Type.String();

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

const EncodedFieldBatch = EncodedFieldBatchGeneric(version, EncodedChunkShape);
type EncodedFieldBatch = Static<typeof EncodedFieldBatch>;

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

	protected onUnreferenced(): void {}
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

	protected onUnreferenced(): void {}
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[cache: DecoderContext<EncodedChunkShape>],
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

const rootDecoder: ChunkDecoder = {
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const shape = readStreamNumber(stream);
		const decoder = getChecked(decoders, shape);
		return decoder.decode(decoders, stream);
	},
};

const idDecodingContext = {
	idCompressor: testIdCompressor,
	originatorId: testIdCompressor.localSessionId,
};

describe("chunkDecodingGeneric", () => {
	it("DecoderContext", () => {
		const cache = new DecoderContext(["a", "b"], [], idDecodingContext);
		assert.equal(cache.identifier("X"), "X");
		assert.equal(cache.identifier(0), "a");
		assert.equal(cache.identifier(1), "b");
	});

	it("readStreamIdentifier", () => {
		const cache = new DecoderContext(["a", "b"], [], idDecodingContext);
		const stream: StreamCursor = { data: ["X", 0, 1], offset: 0 };
		assert.equal(readStreamIdentifier(stream, cache), "X");
		assert.equal(stream.offset, 1);
		assert.equal(readStreamIdentifier(stream, cache), "a");
		assert.equal(stream.offset, 2);
		assert.equal(readStreamIdentifier(stream, cache), "b");
		assert.equal(stream.offset, 3);
	});

	it("decode: constant shape", () => {
		const encoded: EncodedFieldBatch = {
			version,
			identifiers: [],
			shapes: [{ a: 0 }],
			data: [[0, 5]],
		};
		const cache = new DecoderContext(encoded.identifiers, encoded.shapes, idDecodingContext);
		const chunks = decode(decoderLibrary, cache, encoded, rootDecoder);
		assert(chunks.length === 1);
		const chunk = chunks[0];
		assert(chunk instanceof TestChunk2);
		assert.equal(chunk.value, 5);
	});

	it("decode: flexible shape", () => {
		const encoded: EncodedFieldBatch = {
			version,
			identifiers: [],
			shapes: [{ b: "content" }],
			data: [[0]],
		};
		const cache = new DecoderContext(encoded.identifiers, encoded.shapes, idDecodingContext);
		const chunks = decode(decoderLibrary, cache, encoded, rootDecoder);
		assert(chunks.length === 1);
		const chunk = chunks[0];
		assert(chunk instanceof TestChunk1);
		assert.equal(chunk.value, "content");
	});
});
