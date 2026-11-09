/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import {
	type FieldKey,
	type ITreeCursorSynchronous,
	LeafNodeStoredSchema,
	Multiplicity,
	ObjectNodeStoredSchema,
	type SchemaPolicy,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeValue,
	type Value,
	ValueSchema,
	forEachNode,
	identifierFieldKindIdentifier,
} from "../../../core/index.js";
import {
	type NestedMap,
	getOrCreate,
	getOrCreateInNestedMap,
	oneFromIterable,
} from "../../../util/index.js";

import {
	AnyShape,
	type BufferFormat,
	type EncoderContext,
	type FieldEncoder,
	type KeyedFieldEncoder,
	NestedArrayShape,
	type NodeEncoder,
	asFieldEncoder,
	incrementalFieldEncoder,
} from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import { NodeShapeBasedEncoder, SpecializedNodeShapeEncoder } from "./nodeEncoder.js";
import { type SpecializedNodeEncoderPolicy, baseNodeEncoders } from "./schemaBasedEncode.js";
import type { SpecializationStrategy } from "./schemaBasedEncodeVText.js";

/**
 * Creates a {@link SpecializationStrategy} that writes the leaves of single-type sequences as pinned, dictionary or raw values.
 * @remarks
 * Terms:
 *
 * - Single-type sequence: a sequence field that allows only one type of node, for example the atoms of text.
 *
 * - Item: a node of a single-type sequence, for example an atom of text.
 *
 * - Leaf: a string, number or boolean value in an item, or in its child nodes to a depth of {@link maxReadDepth}.
 * For example, the character and each format property of an atom of text.
 *
 * - Pin: the specialized shape of the node holds the value of the leaf as a constant. The data does not hold the value.
 *
 * - Dictionary: each common value of the leaf has a constant leaf shape. The data holds only the index of that shape.
 * Other values hold the index of the base leaf shape and the value.
 *
 * - Raw: the data holds the value.
 *
 * - Signature: the values of the pinned leaves of an item, and the types of its child nodes.
 * Items with the same signature use the same shape.
 *
 * - Run: items that are next to each other and use the same shape. The encoder writes one shape index for each run, not for each item.
 *
 * The strategy does not read the batch before the encode.
 * The encoder of each single-type sequence reads the items of its field, and then writes them.
 * It pins a leaf whose value changes at most one time in {@link minAverageRunLength} items on average, such as a format property.
 * It uses a dictionary for a leaf that is not pinned but has few common values, such as a character.
 * All other leaves are raw.
 *
 * The strategy does not change the encoder of an incremental field.
 * If a single-type sequence is incremental, its items are not specialized.
 * The incremental encoder writes each chunk as a separate batch with its own shapes table.
 * The strategy chooses how to write a chunk from the nodes of the chunk only, so other fields do not change the data of a chunk.
 */
export function runDictionarySpecialization(): SpecializationStrategy {
	return (
		_fieldBatch: FieldBatch,
		schema: StoredSchemaCollection,
		policy: SchemaPolicy,
	): SpecializedNodeEncoderPolicy => {
		const trackedFields = findTrackedFields(schema, policy);
		const singleTypeSequences = findSingleTypeSequences(schema, policy, trackedFields);
		if (singleTypeSequences.size === 0) {
			return baseNodeEncoders;
		}
		const sharedEncoders = new SharedEncoders();
		return (base, schemaName) => {
			const itemTypes = singleTypeSequences.get(schemaName);
			if (itemTypes === undefined) {
				return base;
			}
			// A copy of `base`. Each single-type sequence that is not incremental gets a SingleTypeSequenceEncoder.
			// When the SingleTypeSequenceEncoder writes the sequence, it chooses how to specialize the nodes of the sequence.
			return new NodeShapeBasedEncoder(
				base.type,
				base.value,
				base.specializedFieldEncoders.map((field) => {
					const itemType = itemTypes.get(field.key);
					return itemType === undefined || field.encoder === incrementalFieldEncoder
						? field
						: {
								key: field.key,
								encoder: new SingleTypeSequenceEncoder(
									sharedEncoders,
									trackedFields,
									itemType,
								),
							};
				}),
				base.otherFieldsEncoder,
			);
		};
	};
}

/**
 * A required field of an object node type that the strategy reads.
 * @remarks
 * A "value" field holds one leaf. A "child" field holds one node, and the strategy reads the fields of that node too.
 */
type TrackedField =
	| {
			readonly kind: "value";
			readonly key: FieldKey;
			readonly leafType: TreeNodeSchemaIdentifier;
	  }
	| { readonly kind: "child"; readonly key: FieldKey; readonly polymorphic: boolean };

/**
 * Returns true if `nodeSchema` is the schema of a leaf with a string, number or boolean value.
 */
function isValueLeaf(nodeSchema: TreeNodeStoredSchema | undefined): boolean {
	return (
		nodeSchema instanceof LeafNodeStoredSchema &&
		[ValueSchema.String, ValueSchema.Number, ValueSchema.Boolean].includes(
			nodeSchema.leafValue,
		)
	);
}

/**
 * Gets the {@link TrackedField} for the field `key`, or `undefined` if the strategy does not track the field.
 * @remarks
 * The strategy tracks a required field that is not an identifier field, if the field allows more than one type,
 * or holds an object node, or holds a string, number or boolean leaf.
 */
function getTrackedField(
	key: FieldKey,
	field: TreeFieldStoredSchema,
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
): TrackedField | undefined {
	if (
		field.kind === identifierFieldKindIdentifier ||
		// The strategy reads only fields that hold exactly one node.
		policy.fieldKinds.get(field.kind)?.multiplicity !== Multiplicity.Single
	) {
		return undefined;
	}
	// The field allows more than one type: a polymorphic child field.
	if (field.types.size > 1) {
		return { kind: "child", key, polymorphic: true };
	}
	const onlyType = oneFromIterable(field.types);
	if (onlyType === undefined) {
		return undefined;
	}
	const onlySchema = schema.nodeSchema.get(onlyType);
	// The field allows one object node type: a child field.
	if (onlySchema instanceof ObjectNodeStoredSchema) {
		return { kind: "child", key, polymorphic: false };
	}
	// The field allows one string, number or boolean leaf type: a value field.
	return isValueLeaf(onlySchema) ? { kind: "value", key, leafType: onlyType } : undefined;
}

/**
 * Finds the {@link TrackedField}s of each object node type, in field order.
 * @remarks
 * Types with no tracked fields are not in the result.
 */
function findTrackedFields(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
): Map<TreeNodeSchemaIdentifier, readonly TrackedField[]> {
	const trackedFields = new Map<TreeNodeSchemaIdentifier, readonly TrackedField[]>();
	for (const [type, nodeSchema] of schema.nodeSchema) {
		if (nodeSchema instanceof ObjectNodeStoredSchema) {
			const fields: TrackedField[] = [];
			for (const [key, field] of nodeSchema.objectNodeFields) {
				const tracked = getTrackedField(key, field, schema, policy);
				if (tracked !== undefined) {
					fields.push(tracked);
				}
			}
			if (fields.length > 0) {
				trackedFields.set(type, fields);
			}
		}
	}
	return trackedFields;
}

/**
 * Finds the single-type sequences whose node type has {@link TrackedField}s or is a leaf type.
 * @returns The node type of each single-type sequence, by parent node type and then by field key.
 */
function findSingleTypeSequences(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	trackedFields: ReadonlyMap<TreeNodeSchemaIdentifier, readonly TrackedField[]>,
): Map<TreeNodeSchemaIdentifier, Map<FieldKey, TreeNodeSchemaIdentifier>> {
	const singleTypeSequences = new Map<
		TreeNodeSchemaIdentifier,
		Map<FieldKey, TreeNodeSchemaIdentifier>
	>();
	for (const [type, nodeSchema] of schema.nodeSchema) {
		if (nodeSchema instanceof ObjectNodeStoredSchema) {
			for (const [key, field] of nodeSchema.objectNodeFields) {
				const itemType = oneFromIterable(field.types);
				if (
					itemType !== undefined &&
					// The items are object nodes with tracked fields, such as the atoms of formatted text.
					(trackedFields.has(itemType) ||
						// The items are leaves, such as the characters of plain text.
						// The tracked fields do not include leaf types.
						isValueLeaf(schema.nodeSchema.get(itemType))) &&
					policy.fieldKinds.get(field.kind)?.multiplicity === Multiplicity.Sequence
				) {
					getOrCreate(singleTypeSequences, type, () => new Map()).set(key, itemType);
				}
			}
		}
	}
	return singleTypeSequences;
}

/**
 * Writes a required field of one leaf with a dictionary.
 * @remarks
 * The field shape is polymorphic, so the data starts with a shape index.
 * A value in the dictionary writes the index of its constant leaf shape only.
 * Other values write the index of the base leaf shape and the value.
 */
class DictionaryLeafEncoder implements FieldEncoder {
	public readonly shape = AnyShape.instance;

	public constructor(
		private readonly leafType: TreeNodeSchemaIdentifier,
		/**
		 * The constant leaf encoder of each value in the dictionary.
		 */
		public readonly encoders: ReadonlyMap<Value, NodeEncoder>,
	) {}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		cursor.enterNode(0);
		const encoder =
			this.encoders.get(cursor.value) ?? context.nodeEncoderFromSchema(this.leafType);
		AnyShape.encodeNode(cursor, context, outputBuffer, encoder);
		cursor.exitNode();
	}
}

/**
 * How a single-type sequence writes a leaf: "pinToShape", a {@link DictionaryLeafEncoder}, or "raw".
 */
type LeafEncoding = "pinToShape" | DictionaryLeafEncoder | "raw";

/**
 * The values of one leaf in the nodes of one single-type sequence, and how the sequence writes the leaf.
 */
class LeafStats {
	/**
	 * The value of the leaf in each item that has the leaf, in item order.
	 */
	public readonly values: Value[] = [];
	/**
	 * The number of values that are different from the value before them in {@link LeafStats.values}.
	 */
	public changes = 0;
	/**
	 * How the single-type sequence writes the leaf. The single-type sequence sets it after it reads all nodes.
	 */
	public encoding: LeafEncoding = "raw";

	public constructor(public readonly leafType: TreeNodeSchemaIdentifier) {}

	/**
	 * Adds the value of the leaf in the next item that has the leaf. Add the items in order.
	 */
	public add(value: Value): void {
		if (this.values.length > 0 && this.values.at(-1) !== value) {
			this.changes += 1;
		}
		this.values.push(value);
	}
}

/**
 * The strategy reads leaves to this depth in the nodes of a single-type sequence. The nodes of the sequence are at depth 0.
 * @remarks
 * 3 is a small value that is sufficient for formatted text. The value is not fully measured, and a different value can be better for other data.
 */
const maxReadDepth = 3;

/**
 * The value of a leaf or the type of a child node.
 * @remarks
 * The encoder records one token for each tracked field of each node, and the signature of a node uses some of these tokens.
 */
type Token = Value | TreeNodeSchemaIdentifier;

/**
 * The tracked fields of one node type, at one position in the items of a single-type sequence.
 * @remarks
 * A leaf field has a {@link LeafStats}. A child field has one path node for each type of child node.
 * The path nodes of a single-type sequence make a tree, so the encoder finds the {@link LeafStats} of a leaf without a string path.
 */
class PathNode {
	/**
	 * A {@link FieldPath} for each tracked field of the type, in field order. Empty at {@link maxReadDepth}.
	 */
	public readonly fields: readonly FieldPath[];

	/**
	 * @param type - The node type.
	 * @param depth - The depth of the nodes of this type in the items. The items are at depth 0.
	 * @param trackedFields - The {@link TrackedField}s of each object node type.
	 * @param leaves - Receives the {@link LeafStats} of each leaf field of this path node and of its child path nodes.
	 */
	public constructor(
		type: TreeNodeSchemaIdentifier,
		private readonly depth: number,
		private readonly trackedFields: ReadonlyMap<
			TreeNodeSchemaIdentifier,
			readonly TrackedField[]
		>,
		private readonly leaves: LeafStats[],
	) {
		const fields: FieldPath[] = [];
		const typeFields = trackedFields.get(type);
		// At maxReadDepth, the path node reads no fields, so the signature does not go deeper.
		if (depth < maxReadDepth && typeFields !== undefined) {
			for (const trackedField of typeFields) {
				if (trackedField.kind === "child") {
					fields.push({
						kind: "child",
						key: trackedField.key,
						polymorphic: trackedField.polymorphic,
						types: new Map(),
					});
				} else {
					const leaf = new LeafStats(trackedField.leafType);
					leaves.push(leaf);
					fields.push({ kind: "value", key: trackedField.key, leaf });
				}
			}
		}
		this.fields = fields;
	}

	/**
	 * Adds the leaves of the node at `cursor` to their {@link LeafStats}, and adds one {@link Token} for each field to `trace`.
	 */
	public add(cursor: ITreeCursorSynchronous, trace: Token[]): void {
		for (const field of this.fields) {
			cursor.enterField(field.key);
			cursor.enterNode(0);
			this.addNode(cursor, field, trace);
			cursor.exitNode();
			cursor.exitField();
		}
	}

	/**
	 * Adds the node at `cursor`, which is the one node of `field`.
	 */
	private addNode(cursor: ITreeCursorSynchronous, field: FieldPath, trace: Token[]): void {
		if (field.kind === "value") {
			const value = cursor.value;
			field.leaf.add(value);
			// The position of a token tells if it is a value or a type, because each node of a type adds its fields in the same order.
			trace.push(value);
			return;
		}
		const type = cursor.type;
		trace.push(type);
		const childPath = getOrCreate(
			field.types,
			type,
			() => new PathNode(type, this.depth + 1, this.trackedFields, this.leaves),
		);
		childPath.add(cursor, trace);
	}
}

/**
 * A field of a {@link PathNode}. It has the same kinds as {@link TrackedField}.
 * @remarks
 * A "value" field has the {@link LeafStats} of its leaf.
 * A "child" field has a {@link PathNode} for each type of child node that the encoder finds.
 */
type FieldPath =
	| { readonly kind: "value"; readonly key: FieldKey; readonly leaf: LeafStats }
	| {
			readonly kind: "child";
			readonly key: FieldKey;
			readonly polymorphic: boolean;
			readonly types: Map<TreeNodeSchemaIdentifier, PathNode>;
	  };

/**
 * A node of a trie of the signatures of the items of one single-type sequence. Each edge is a {@link Token}.
 */
interface TrieNode {
	/**
	 * The next trie node for each token.
	 */
	readonly children: Map<Token, TrieNode>;
	/**
	 * The encoder of the items whose signature ends at this trie node.
	 * {@link SingleTypeSequenceEncoder} sets it at the first item with this signature.
	 */
	encoder?: NodeEncoder;
}

/**
 * Makes a {@link TrieNode} with no children.
 */
function newTrieNode(): TrieNode {
	return { children: new Map() };
}

/**
 * Follows the signature of a node in the trie, and adds the missing trie nodes.
 * @remarks
 * Reads the tokens that {@link PathNode.add} added to `trace` for the node.
 * Follows the tokens of pinned leaves and child types, and skips the tokens of other leaves.
 * @param pathNode - The path node of the node.
 * @param trieNode - The trie node where the signature of the node starts.
 * @param trace - The tokens of all items.
 * @param reader - The position of the next token in `trace`. The function moves it past the tokens of the node.
 * @returns The trie node where the signature of the node ends.
 */
function replaySignature(
	pathNode: PathNode,
	trieNode: TrieNode,
	trace: readonly Token[],
	reader: { position: number },
): TrieNode {
	let current = trieNode;
	for (const field of pathNode.fields) {
		const token = trace[reader.position];
		reader.position += 1;
		if (field.kind === "child") {
			const type = token as TreeNodeSchemaIdentifier;
			const childPathNode = field.types.get(type) ?? fail("child type was not read");
			const childTrieNode = getOrCreate(current.children, type, newTrieNode);
			current = replaySignature(childPathNode, childTrieNode, trace, reader);
		} else if (field.leaf.encoding === "pinToShape") {
			// Only a pinned leaf is part of the signature. The trie skips the tokens of other leaves.
			current = getOrCreate(current.children, token, newTrieNode);
		}
	}
	return current;
}

/**
 * The encoders that all single-type sequences of one encode share.
 * @remarks
 * The shapes table holds one shape for each encoder object, so this class keeps one encoder object for each shape.
 * Some equal shapes can still occur. For example, two specialized encoders that differ only in their dictionaries have equal shapes,
 * because the shape of each {@link DictionaryLeafEncoder} is {@link AnyShape}.
 */
class SharedEncoders {
	/**
	 * The constant leaf encoders, by leaf type and then by value.
	 */
	private readonly constantLeaves: NestedMap<TreeNodeSchemaIdentifier, Value, NodeEncoder> =
		new Map();
	/**
	 * The dictionary encoders, by leaf type and the sorted JSON of their values.
	 */
	private readonly dictionaries = new Map<string, DictionaryLeafEncoder>();
	/**
	 * The specialized encoders, by their base encoder and the encoders of their fields.
	 */
	private readonly specialized = new Map<string, NodeEncoder>();
	/**
	 * A number for each field key and encoder in the keys of {@link SharedEncoders.specialized}.
	 */
	private readonly ids = new Map<unknown, number>();

	/**
	 * Gets the encoder of a leaf with a constant value, and makes it if it does not exist.
	 * @param leafType - The type of the leaf.
	 * @param value - The constant value of the leaf.
	 */
	public constantLeaf(leafType: TreeNodeSchemaIdentifier, value: Value): NodeEncoder {
		return getOrCreateInNestedMap(
			this.constantLeaves,
			leafType,
			value,
			() => new NodeShapeBasedEncoder(leafType, [value], [], undefined),
		);
	}

	/**
	 * Gets the {@link DictionaryLeafEncoder} for a set of values, and makes it if it does not exist.
	 * @param leafType - The type of the leaves.
	 * @param admitted - The values in the dictionary. Their order does not change the result.
	 */
	public dictionary(
		leafType: TreeNodeSchemaIdentifier,
		admitted: readonly Value[],
	): DictionaryLeafEncoder {
		// Sort the values, so that the same set of values in a different order gets the same encoder.
		const sortedValueJson = admitted.map((value) => JSON.stringify(value)).sort();
		const cacheKey = `${leafType}:${sortedValueJson.join(",")}`;
		return getOrCreate(this.dictionaries, cacheKey, () => {
			const encoders = new Map(
				admitted.map((value) => [value, this.constantLeaf(leafType, value)]),
			);
			return new DictionaryLeafEncoder(leafType, encoders);
		});
	}

	/**
	 * Gets the specialized encoder for the node at `cursor`.
	 * @remarks
	 * The shape holds each pinned leaf as a constant, and writes each dictionary leaf with its {@link DictionaryLeafEncoder}.
	 * It uses the encoder of a child node as the field encoder if the child is specialized or its field allows more than one type.
	 * It does not change the encoders of incremental fields.
	 * Returns `base` if nothing is specialized.
	 * Each field that `path` reads must have exactly one node.
	 * @param base - The encoder of the type of the node.
	 * @param path - The {@link PathNode} of the node.
	 */
	public specialize(
		cursor: ITreeCursorSynchronous,
		base: NodeEncoder,
		path: PathNode,
		context: EncoderContext,
	): NodeEncoder {
		// Only a NodeShapeBasedEncoder can have a specialized shape. With this strategy, `base` is always one.
		if (!(base instanceof NodeShapeBasedEncoder)) {
			return base;
		}
		// The field encoders that replace the field encoders of `base`. Raw leaves keep the base encoder.
		const fieldOverrides: KeyedFieldEncoder[] = [];
		// The cache key: the id of `base`, and the ids of each field key and its override.
		// Calls with the same key get the same encoder object, so the shapes table holds one shape for them.
		let cacheKey = `${this.id(base)}`;
		for (const field of path.fields) {
			if (
				base.specializedFieldEncoders.some(
					(baseField) =>
						baseField.key === field.key && baseField.encoder === incrementalFieldEncoder,
				)
			) {
				continue;
			}
			cursor.enterField(field.key);
			cursor.enterNode(0);
			let override: NodeEncoder | DictionaryLeafEncoder | undefined;
			if (field.kind === "value") {
				const encoding = field.leaf.encoding;
				if (encoding === "pinToShape") {
					override = this.constantLeaf(field.leaf.leafType, cursor.value);
				} else if (encoding !== "raw") {
					override = encoding;
				}
			} else {
				const childBase = context.nodeEncoderFromSchema(cursor.type);
				const childPath = field.types.get(cursor.type) ?? fail("child type was not read");
				const child = this.specialize(cursor, childBase, childPath, context);
				// Use the child encoder if it is specialized, or if the field is polymorphic.
				// In a polymorphic field, the child encoder puts the child type in the shape, not in the data.
				if (field.polymorphic || child !== childBase) {
					override = child;
				}
			}
			cursor.exitNode();
			cursor.exitField();
			if (override !== undefined) {
				fieldOverrides.push({
					key: field.key,
					encoder:
						override instanceof DictionaryLeafEncoder ? override : asFieldEncoder(override),
				});
				cacheKey += `,${this.id(field.key)}=${this.id(override)}`;
			}
		}
		return fieldOverrides.length === 0
			? base
			: getOrCreate(
					this.specialized,
					cacheKey,
					() => new SpecializedNodeShapeEncoder(base, fieldOverrides),
				);
	}

	/**
	 * Gets a number that identifies `value` in the cache keys of {@link SharedEncoders.specialized}.
	 * @remarks
	 * The first new value gets 0, the next gets 1, and so on. The same value always gets the same number.
	 */
	private id(value: unknown): number {
		return getOrCreate(this.ids, value, () => this.ids.size);
	}
}

/**
 * The strategy pins a leaf if its value changes at most one time in this number of items, on average.
 * @remarks
 * Each change of a pinned leaf starts a new run, and each value of a pinned leaf adds shapes.
 */
const minAverageRunLength = 8;

/**
 * The strategy pins a leaf only if each of its values is in at least this number of items, on average.
 * @remarks
 * Each value of a pinned leaf adds about 80 bytes of shapes, and each item saves only the bytes of the value.
 */
const minItemsPerPinnedValue = 20;

/**
 * The number of bytes that one constant leaf shape adds to the shapes table, without the JSON of its value.
 * @remarks
 * For example, `{"c":{"type":0,"value":["a"]}},` is 28 bytes and the 3 bytes of `"a"`.
 */
const constantLeafShapeBytes = 28;

/**
 * The maximum number of different values of a leaf that the strategy counts.
 * @remarks
 * Other values are not in the dictionary. This limits the time and memory for leaves with many values.
 */
const maxCountedValues = 1000;

/**
 * The minimum part of the values of a leaf that must be in the dictionary, for the leaf to use the dictionary.
 * @remarks
 * A value that is not in the dictionary writes one more shape index than a raw value.
 */
const minDictionaryCoverage = 0.75;

/**
 * Returns true if a value in `count` items saves more bytes in the data than its constant leaf shape adds to the shapes table.
 * @remarks
 * The costs are for ASCII text. `jsonLength` counts characters, and a character that is not ASCII is more than one byte in UTF-8.
 * For these characters, the function calculates less savings than the real savings, so the dictionary can leave out some values that save bytes.
 * @param jsonLength - The length of the value as JSON.
 * @param indexBytes - The length of a shape index and its comma.
 */
function savesBytes(count: number, jsonLength: number, indexBytes: number): boolean {
	// Each item saves the value and its comma, and adds a shape index.
	const savedInData = count * (jsonLength + 1 - indexBytes);
	// The constant leaf shape holds the value too.
	const addedToShapes = constantLeafShapeBytes + jsonLength;
	return savedInData > addedToShapes;
}

/**
 * Chooses how a single-type sequence writes a leaf.
 * @remarks
 * Returns "pinToShape" if the value changes at most one time in {@link minAverageRunLength} items,
 * and each value is in at least {@link minItemsPerPinnedValue} items, on average.
 * If not, it admits each value that {@link savesBytes}, to a maximum of {@link maxCountedValues} different values.
 * It returns a dictionary of these values if they are at least {@link minDictionaryCoverage} of the values, and "raw" if not.
 * @param leaf - The values of the leaf in the items.
 * @param sharedEncoders - Gives the dictionary encoder.
 */
function chooseLeafEncoding(leaf: LeafStats, sharedEncoders: SharedEncoders): LeafEncoding {
	const valueTotal = leaf.values.length;

	// Count each value. After maxCountedValues different values, new values are not counted.
	const valueCounts = new Map<Value, number>();
	let valueCountsTruncated = false;
	for (const value of leaf.values) {
		const valueCount = valueCounts.get(value);
		if (valueCount !== undefined) {
			valueCounts.set(value, valueCount + 1);
		} else if (valueCounts.size < maxCountedValues) {
			valueCounts.set(value, 1);
		} else {
			valueCountsTruncated = true;
		}
	}

	// The value has `changes + 1` runs in the values.
	if (
		!valueCountsTruncated &&
		(leaf.changes + 1) * minAverageRunLength <= valueTotal &&
		valueCounts.size * minItemsPerPinnedValue <= valueTotal
	) {
		return "pinToShape";
	}

	// A dictionary with more values has longer shape indexes.
	const indexBytes = String(valueCounts.size).length + 1;
	const admitted: Value[] = [];
	let admittedTotal = 0;
	for (const [value, valueCount] of valueCounts) {
		// A value in only one item cannot save the bytes of its shape, so it does not need JSON.stringify.
		if (valueCount > 1 && savesBytes(valueCount, JSON.stringify(value).length, indexBytes)) {
			admitted.push(value);
			admittedTotal += valueCount;
		}
	}

	if (admittedTotal >= valueTotal * minDictionaryCoverage) {
		return sharedEncoders.dictionary(leaf.leafType, admitted);
	}
	return "raw";
}

/**
 * The shape of the data of a single-type sequence: a nested array where each item starts with its shape.
 */
const singleTypeSequenceShape = new NestedArrayShape(AnyShape.instance);

/**
 * Writes a single-type sequence.
 * @remarks
 * Reads the leaves of each node one time, to choose how to write each leaf and to record the signature of each node.
 * Then it chooses the shape of each node from its signature, and writes the runs.
 */
class SingleTypeSequenceEncoder implements FieldEncoder {
	public readonly shape = singleTypeSequenceShape;

	/**
	 * @param trackedFields - The {@link TrackedField}s of each object node type.
	 * @param itemType - The one allowed type of the items of the field.
	 */
	public constructor(
		private readonly sharedEncoders: SharedEncoders,
		private readonly trackedFields: ReadonlyMap<
			TreeNodeSchemaIdentifier,
			readonly TrackedField[]
		>,
		private readonly itemType: TreeNodeSchemaIdentifier,
	) {}

	/**
	 * Writes the field at `cursor`.
	 * @remarks
	 * An empty field writes 0, as the format requires for an empty nested array.
	 */
	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		if (cursor.getFieldLength() === 0) {
			outputBuffer.push(0);
			return;
		}
		const itemEncoder = context.nodeEncoderFromSchema(this.itemType);
		// The items are object nodes with tracked fields, or leaves. See findSingleTypeSequences.
		const itemsAreObjects = this.trackedFields.has(this.itemType);
		outputBuffer.push(
			itemsAreObjects
				? this.encodeObjects(cursor, itemEncoder, context)
				: this.encodeLeaves(cursor, itemEncoder, context),
		);
	}

	/**
	 * Writes a field of object nodes.
	 * @param itemEncoder - The encoder of {@link SingleTypeSequenceEncoder.itemType}.
	 * @returns The data of the field.
	 */
	private encodeObjects(
		cursor: ITreeCursorSynchronous,
		itemEncoder: NodeEncoder,
		context: EncoderContext,
	): BufferFormat {
		const itemEncoders = this.chooseNodeEncoders(cursor, itemEncoder, context);
		cursor.firstNode();
		return this.encodeRuns(itemEncoders, context, (encoder, buffer) => {
			encoder.encodeNode(cursor, context, buffer);
			cursor.nextNode();
		});
	}

	/**
	 * Writes a field of leaves.
	 * @remarks
	 * Writes the values without the cursor:
	 * a constant leaf has no data, and a leaf that uses the item encoder has only its value.
	 * @param itemEncoder - The encoder of {@link SingleTypeSequenceEncoder.itemType}.
	 * @returns The data of the field.
	 */
	private encodeLeaves(
		cursor: ITreeCursorSynchronous,
		itemEncoder: NodeEncoder,
		context: EncoderContext,
	): BufferFormat {
		const leaf = new LeafStats(this.itemType);
		forEachNode(cursor, () => leaf.add(cursor.value));
		const encoding = chooseLeafEncoding(leaf, this.sharedEncoders);
		const itemEncoders = leaf.values.map((value) => {
			if (encoding === "pinToShape") {
				return this.sharedEncoders.constantLeaf(this.itemType, value);
			}
			if (encoding === "raw") {
				return itemEncoder;
			}
			return encoding.encoders.get(value) ?? itemEncoder;
		});
		return this.encodeRuns(itemEncoders, context, (encoder, buffer, index) => {
			if (encoder === itemEncoder) {
				buffer.push(leaf.values[index] as TreeValue);
			}
		});
	}

	/**
	 * Writes the runs of items with the same encoder.
	 * @param itemEncoders - The encoder of each item of the field.
	 * @param encodeItem - Writes the item at `index` with `encoder` to `buffer`. It is called for each item, in order.
	 * @returns The data of the field.
	 */
	private encodeRuns(
		itemEncoders: readonly NodeEncoder[],
		context: EncoderContext,
		encodeItem: (encoder: NodeEncoder, buffer: BufferFormat, index: number) => void,
	): BufferFormat {
		const buffer: BufferFormat = [];
		let runStart = 0;
		for (let index = 1; index <= itemEncoders.length; index++) {
			const runEncoder = itemEncoders[runStart] ?? fail("missing item encoder");
			// A run ends at the end of the field, or before an item with a different encoder.
			if (index === itemEncoders.length || itemEncoders[index] !== runEncoder) {
				this.writeRun(buffer, runEncoder, runStart, index, context, encodeItem);
				runStart = index;
			}
		}
		return buffer;
	}

	/**
	 * Writes the run of the items from `start` to `end - 1` to `buffer`.
	 * @remarks
	 * A run of one item writes the item shape and the item data.
	 * A longer run writes a nested array shape and an array of the data of its items.
	 * If the items have no data, the run writes the number of items in place of the array.
	 * All items of a run have the same shape, so all of them have data or none of them do.
	 * @param encoder - The encoder of all items of the run.
	 */
	private writeRun(
		buffer: BufferFormat,
		encoder: NodeEncoder,
		start: number,
		end: number,
		context: EncoderContext,
		encodeItem: (encoder: NodeEncoder, buffer: BufferFormat, index: number) => void,
	): void {
		if (end - start === 1) {
			buffer.push(encoder.shape);
			encodeItem(encoder, buffer, start);
			return;
		}
		buffer.push(context.nestedArrayEncoder(encoder).shape);
		const runData: BufferFormat = [];
		for (let index = start; index < end; index++) {
			encodeItem(encoder, runData, index);
		}
		buffer.push(runData.length === 0 ? end - start : runData);
	}

	/**
	 * Chooses the encoder of each node of a field of object nodes.
	 * @remarks
	 * If all leaves are raw, every node uses `itemEncoder`.
	 * The cursor reads the fields of a node again only for the first node with each signature, to make its specialized encoder.
	 */
	private chooseNodeEncoders(
		cursor: ITreeCursorSynchronous,
		itemEncoder: NodeEncoder,
		context: EncoderContext,
	): NodeEncoder[] {
		// Read: add the leaves of each item to their LeafStats, and record the tokens of each item.
		const leaves: LeafStats[] = [];
		const root = new PathNode(this.itemType, 0, this.trackedFields, leaves);
		const trace: Token[] = [];
		let itemCount = 0;
		forEachNode(cursor, () => {
			root.add(cursor, trace);
			itemCount += 1;
		});

		// Choose: how to write each leaf. If all leaves are raw, no item is specialized.
		for (const leaf of leaves) {
			leaf.encoding = chooseLeafEncoding(leaf, this.sharedEncoders);
		}
		if (leaves.every((leaf) => leaf.encoding === "raw")) {
			return Array.from({ length: itemCount }, () => itemEncoder);
		}

		// Specialize: find the encoder of each signature in the trie, and make it for the first item with that signature.
		// The cursor walks the items in order, because `enterNode(index)` is slow on some cursors.
		// The items read their tokens in the same order, so `reader` moves from one item to the next.
		const trie = newTrieNode();
		const reader = { position: 0 };
		const itemEncoders: NodeEncoder[] = [];
		forEachNode(cursor, () => {
			const match = replaySignature(root, trie, trace, reader);
			// The first item with this signature makes the encoder.
			match.encoder ??= this.sharedEncoders.specialize(cursor, itemEncoder, root, context);
			itemEncoders.push(match.encoder);
		});
		return itemEncoders;
	}
}
