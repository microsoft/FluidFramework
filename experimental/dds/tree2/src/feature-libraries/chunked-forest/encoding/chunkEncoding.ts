/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { fail, getOrCreate } from "../../../util";
import {
	FieldKey,
	GlobalFieldKey,
	LocalFieldKey,
	TreeSchemaIdentifier,
	ValueSchema,
	isGlobalFieldKey,
	keyFromSymbol,
	symbolFromKey,
} from "../../../core";
import { TreeChunk } from "../chunk";
import { BasicChunk } from "../basicChunk";
import { SequenceChunk } from "../sequenceChunk";
import { ChunkShape, UniformChunk } from "../uniformChunk";
import { Multiplicity, TreeSchema } from "../../modular-schema";
import { EncodedChunk, EncodedChunkShape, EncodedFieldShape, version } from "./format";
import { Counter, DeduplicationTable } from "./chunkEncodingUtilities";
import {
	BufferFormat,
	ChunkEncoderLibrary,
	NamedChunkEncoder,
	encode as encodeGeneric,
	Shape as ShapeGeneric,
	IdentifierToken,
} from "./chunkEncodingGeneric";

export function encode(chunk: TreeChunk): EncodedChunk {
	return encodeGeneric(version, encoderLibrary, new ShapeManager(), chunk);
}

type Shape = ShapeGeneric<EncodedChunkShape>;

interface EncoderShape extends Shape {
	encodeData(
		chunk: TreeChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
		prefixWithShape: boolean,
	): void;
}

const sequenceEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, SequenceChunk> = {
	type: SequenceChunk,
	encode(
		chunk: SequenceChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		encodeChunkArray(chunk.subChunks, shapes, outputBuffer);
	},
};

/**
 * Encode an array of chunks as a single chunk.
 *
 * Prefixed by shape used. Selects shape based on chunks.
 */
function encodeChunkArray(
	chunks: readonly TreeChunk[],
	shapes: ShapeManager,
	outputBuffer: BufferFormat<EncodedChunkShape>,
): void {
	if (chunks.length === 1) {
		encoderLibrary.encode(chunks[0], shapes, outputBuffer);
	} else {
		outputBuffer.push(ArrayShape.instance);
		outputBuffer.push(chunks.length);
		for (const subChunk of chunks) {
			encoderLibrary.encode(subChunk, shapes, outputBuffer);
		}
	}
}

const basicEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, BasicChunk> = {
	type: BasicChunk,
	encode(
		chunk: BasicChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		const shape = shapes.basicChunkShape(chunk.type);
		shape.encodeData(chunk, shapes, outputBuffer, true);
	},
};

/**
 * Builds shapes with deduplication.
 */
class ShapeManager {
	private readonly map: Map<TreeSchemaIdentifier, TreeShapeManager> = new Map();
	private readonly chunkShapes: Map<ChunkShape, Shape> = new Map();

	public chunkShape(chunk: ChunkShape): Shape {
		return getOrCreate(
			this.chunkShapes,
			chunk,
			(chunkShape): Shape => new UniformShape(chunkShape),
		);
	}

	public basicChunkShape(typeName: TreeSchemaIdentifier): BasicShape {
		return getOrCreate(
			this.map,
			typeName,
			(type): TreeShapeManager => new TreeShapeManager(type, this),
		).shape;
	}
}

class TreeShapeManager {
	/**
	 * Shape purely based on schema.
	 *
	 * TODO: maybe have this detect monomorphic schema and use a uniform chunk for them instead?
	 * TODO: support common shapes that are not pure schema based.
	 */
	public readonly shape: BasicShape;
	public constructor(
		public readonly type: TreeSchemaIdentifier,
		private readonly cache: ShapeManager,
	) {
		// TODO: provide schema here, and made BasicShape actually use it.
		this.shape = new BasicShape(type, undefined, cache);
	}
}

class UniformShape extends ShapeGeneric<EncodedChunkShape> {
	public constructor(private readonly chunkShape: ChunkShape) {
		super();
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		// TODO
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		fail("todo");
	}
}

const uniformEncoder: NamedChunkEncoder<ShapeManager, EncodedChunkShape, UniformChunk> = {
	type: UniformChunk,
	encode(
		chunk: UniformChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
	): void {
		outputBuffer.push(shapes.chunkShape(chunk.shape));
		outputBuffer.push(chunk.values);
	},
};

class BasicShape extends ShapeGeneric<EncodedChunkShape> implements EncoderShape {
	private readonly localShapes: { key: LocalFieldKey; shape?: EncoderShape }[] = [];
	private extraLocalFields: boolean = true;

	private readonly globalShapes: { key: GlobalFieldKey; shape?: EncoderShape }[] = [];
	private extraGlobalFields: boolean = true;

	/**
	 * Keys handled by the lists above.
	 */
	private readonly explicitKeys: Set<FieldKey> = new Set();

	private readonly initialized = false;

	private readonly hasValue: boolean | undefined;

	public constructor(
		private readonly type: TreeSchemaIdentifier,
		private readonly schema: TreeSchema | undefined,
		private readonly cache: ShapeManager,
	) {
		super();
		if (schema !== undefined) {
			const value: ValueSchema = schema.value;
			switch (value) {
				case ValueSchema.Nothing:
					this.hasValue = false;
					break;
				case ValueSchema.Number:
				case ValueSchema.String:
				case ValueSchema.Boolean:
					this.hasValue = true;
					break;
				case ValueSchema.Serializable:
					this.hasValue = undefined;
					break;
				default:
					unreachableCase(value);
			}
		}
	}

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {
		// To handle recursive types, we don't do initialization eagerly in the constructor.
		assert(!this.initialized, "count should not be called twice");

		if (this.schema === undefined) {
			this.extraLocalFields = true;
			this.extraGlobalFields = true;
		} else {
			this.extraLocalFields = this.schema.extraLocalFields !== undefined;
			this.extraGlobalFields = this.schema.extraGlobalFields !== undefined;
			for (const [_key, field] of this.schema.localFields) {
				const multiplicity = field.kind.multiplicity;
				switch (multiplicity) {
					case Multiplicity.Forbidden:
						break;
					case Multiplicity.Optional:
						this.extraLocalFields = true;
						break;
					case Multiplicity.Sequence:
						this.extraLocalFields = true;
						break;
					case Multiplicity.Value:
						// TODO: determine field shapes instead of using extraLocalFields
						this.extraLocalFields = true;
						// this.localShapes.push({ key, shape: this.cache.basicChunkShape() });
						break;
					default:
						unreachableCase(multiplicity);
				}
			}

			if (this.schema.globalFields.size > 0) {
				// TODO: determine field shapes instead of using extraLocalFields
				this.extraGlobalFields = true;
			}

			for (const { key } of this.localShapes) {
				this.explicitKeys.add(key);
			}
			for (const { key } of this.globalShapes) {
				this.explicitKeys.add(symbolFromKey(key));
			}

			for (const fields of [this.localShapes, this.globalShapes]) {
				for (const { key, shape } of fields) {
					identifiers.add(key);
					if (shape !== undefined) {
						shapes(shape);
					}
				}
			}
		}
	}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		assert(this.initialized, "count should be called");

		const local: EncodedFieldShape[] = [];
		for (const { key, shape } of this.localShapes) {
			local.push({
				key: encodeIdentifier(identifiers, key),
				shape: shape === undefined ? undefined : encodeShape(shapes, shape),
			});
		}
		const global: EncodedFieldShape[] = [];
		for (const { key, shape } of this.globalShapes) {
			global.push({
				key: encodeIdentifier(identifiers, key),
				shape: shape === undefined ? undefined : encodeShape(shapes, shape),
			});
		}

		return {
			b: {
				type: encodeIdentifier(identifiers, this.type),
				local,
				global,
				value: this.hasValue,
				extraLocalFields: this.extraLocalFields,
				extraGlobalFields: this.extraGlobalFields,
			},
		};
	}

	public encodeData(
		chunk: TreeChunk,
		shapes: ShapeManager,
		outputBuffer: BufferFormat<EncodedChunkShape>,
		prefixWithShape: boolean,
	): void {
		assert(this.initialized, "count should be called before using shape");
		if (!(chunk instanceof BasicChunk)) {
			// TODO: maybe make encoding work on cursor (which chunk based heuristics and fast paths) or re-chunk as needed.
			fail("Unexpected chunk");
		}

		if (prefixWithShape) {
			outputBuffer.push(this);
		}
		if (this.hasValue === undefined) {
			if (chunk.value !== undefined) {
				outputBuffer.push(true, chunk.value);
			} else {
				outputBuffer.push(false);
			}
		} else {
			assert(this.hasValue === (chunk.value !== undefined), "invalid hasValue");
			if (this.hasValue) {
				outputBuffer.push(chunk.value);
			}
		}

		function encodeField(
			key: FieldKey,
			shape: undefined | EncoderShape,
			parent: BasicChunk,
		): void {
			const chunks = parent.fields.get(key) ?? [];
			if (shape === undefined) {
				encodeChunkArray(chunks, shapes, outputBuffer);
			} else {
				// TODO: make this work when/if refactoring this to not assume encoding matches existing chunk structure.
				assert(chunks.length === 1, "fixed shape must be single chunk");
				shape.encodeData(chunks[0], shapes, outputBuffer, false);
			}
		}

		for (const { key, shape } of this.localShapes) {
			encodeField(key, shape, chunk);
		}
		for (const { key, shape } of this.globalShapes) {
			encodeField(symbolFromKey(key), shape, chunk);
		}

		const extraLocal: [string, TreeChunk[]][] = [];
		const extraGlobal: [string, TreeChunk[]][] = [];
		for (const [key, chunks] of chunk.fields) {
			if (!this.explicitKeys.has(key)) {
				if (isGlobalFieldKey(key)) {
					extraGlobal.push([keyFromSymbol(key), chunks]);
				} else {
					extraLocal.push([key, chunks]);
				}
			}
		}

		function encodeExtras(enabled: boolean, data: [string, TreeChunk[]][]): void {
			if (enabled) {
				outputBuffer.push(data.length);
				for (const [key, chunks] of data) {
					outputBuffer.push(new IdentifierToken(key));
					encodeChunkArray(chunks, shapes, outputBuffer);
				}
			} else {
				assert(data.length === 0, "had extra fields when not allowed by shape");
			}
		}

		encodeExtras(this.extraLocalFields, extraLocal);
		encodeExtras(this.extraGlobalFields, extraGlobal);
	}
}

function encodeIdentifier(table: DeduplicationTable<string>, identifier: string): string | number {
	return table.valueToIndex.get(identifier) ?? identifier;
}

function encodeShape(table: DeduplicationTable<Shape>, shape: Shape): number {
	return table.valueToIndex.get(shape) ?? fail("unexpected shape");
}

class ArrayShape extends ShapeGeneric<EncodedChunkShape> {
	private constructor() {
		super();
	}
	public static readonly instance = new ArrayShape();

	public count(identifiers: Counter<string>, shapes: (shape: Shape) => void): void {}

	public encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape>,
	): EncodedChunkShape {
		return { c: 0 };
	}
}

const encoderLibrary = new ChunkEncoderLibrary<ShapeManager, EncodedChunkShape>(
	sequenceEncoder,
	basicEncoder,
	uniformEncoder,
);
