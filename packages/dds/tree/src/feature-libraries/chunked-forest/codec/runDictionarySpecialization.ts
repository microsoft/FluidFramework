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
 * Creates a {@link SpecializationStrategy} that writes the leaves of run fields as pinned, dictionary or raw values.
 * @remarks
 * Terms:
 *
 * - Run field: a sequence field that allows only one type of node, for example the atoms of text.
 *
 * - Leaf: a string, number or boolean value in a node of a run field, or in its child nodes to a depth of {@link maxSignatureDepth}.
 * For example, the character and each format property of an atom of text.
 *
 * - Pin: the specialized shape of the node keeps the value of the leaf as a constant. The data does not hold the value.
 *
 * - Dictionary: each common value of the leaf has a constant leaf shape. The data holds only the index of that shape.
 * Other values hold the index of the base leaf shape and the value.
 *
 * - Raw: the data holds the value.
 *
 * - Signature: the values of the pinned leaves of a node, and the types of its child nodes.
 * Nodes with the same signature use the same shape.
 *
 * - Run: nodes that are next to each other and use the same shape. The encoder writes a run as one item.
 *
 * The strategy does not read the batch before the encode.
 * The encoder of each run field reads the nodes of its field, and then writes them.
 * It pins a leaf that changes rarely, such as a format property.
 * It uses a dictionary for a leaf that changes often but has few common values, such as a character.
 * All other leaves are raw.
 *
 * Incremental fields keep their usual encoder.
 */
export function runDictionarySpecialization(): SpecializationStrategy {
	return (
		fieldBatch: FieldBatch,
		schema: StoredSchemaCollection,
		policy: SchemaPolicy,
	): SpecializedNodeEncoderPolicy => {
		const plans = makePlans(schema, policy);
		const runFields = findRunFields(schema, policy, plans);
		if (runFields.size === 0) {
			return baseNodeEncoders;
		}
		const shared = new SharedEncoders(plans);
		return (base, schemaName) => {
			const elementTypes = runFields.get(schemaName);
			if (elementTypes === undefined) {
				return base;
			}
			return new NodeShapeBasedEncoder(
				base.type,
				base.value,
				base.specializedFieldEncoders.map((field) => {
					const elementType = elementTypes.get(field.key);
					return elementType === undefined || field.encoder === incrementalFieldEncoder
						? field
						: { key: field.key, encoder: new RunFieldEncoder(shared, elementType) };
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
type PlanEntry =
	| {
			readonly kind: "value";
			readonly key: FieldKey;
			readonly leafType: TreeNodeSchemaIdentifier;
	  }
	| { readonly kind: "child"; readonly key: FieldKey; readonly polymorphic: boolean };

/**
 * The fields that the strategy reads from the nodes of one object node type, in field order.
 */
type Plan = readonly PlanEntry[];

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
 * Makes the {@link Plan} of each object node type.
 * @remarks
 * A plan holds the required fields that are not identifier fields,
 * if they hold a leaf or an object node, or if they allow more than one type.
 * Types with no fields in their plan are not in the result.
 */
function makePlans(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
): Map<TreeNodeSchemaIdentifier, Plan> {
	const plans = new Map<TreeNodeSchemaIdentifier, Plan>();
	for (const [type, nodeSchema] of schema.nodeSchema) {
		if (!(nodeSchema instanceof ObjectNodeStoredSchema)) {
			continue;
		}
		const plan: PlanEntry[] = [];
		for (const [key, field] of nodeSchema.objectNodeFields) {
			if (
				field.kind === identifierFieldKindIdentifier ||
				policy.fieldKinds.get(field.kind)?.multiplicity !== Multiplicity.Single
			) {
				continue;
			}
			const onlyType = oneFromIterable(field.types);
			const onlySchema = onlyType === undefined ? undefined : schema.nodeSchema.get(onlyType);
			if (field.types.size > 1) {
				plan.push({ kind: "child", key, polymorphic: true });
			} else if (onlySchema instanceof ObjectNodeStoredSchema) {
				plan.push({ kind: "child", key, polymorphic: false });
			} else if (onlyType !== undefined && isValueLeaf(onlySchema)) {
				plan.push({ kind: "value", key, leafType: onlyType });
			}
		}
		if (plan.length > 0) {
			plans.set(type, plan);
		}
	}
	return plans;
}

/**
 * Finds the run fields whose node type has a {@link Plan} or is a leaf type.
 * @returns The node type of each run field, by parent node type and then by field key.
 */
function findRunFields(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	plans: ReadonlyMap<TreeNodeSchemaIdentifier, Plan>,
): Map<TreeNodeSchemaIdentifier, Map<FieldKey, TreeNodeSchemaIdentifier>> {
	const result = new Map<TreeNodeSchemaIdentifier, Map<FieldKey, TreeNodeSchemaIdentifier>>();
	for (const [type, nodeSchema] of schema.nodeSchema) {
		if (!(nodeSchema instanceof ObjectNodeStoredSchema)) {
			continue;
		}
		for (const [key, field] of nodeSchema.objectNodeFields) {
			const elementType = oneFromIterable(field.types);
			if (
				elementType !== undefined &&
				(plans.has(elementType) || isValueLeaf(schema.nodeSchema.get(elementType))) &&
				policy.fieldKinds.get(field.kind)?.multiplicity === Multiplicity.Sequence
			) {
				getOrCreate(result, type, () => new Map()).set(key, elementType);
			}
		}
	}
	return result;
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
 * How a run field writes a leaf: "pin", a {@link DictionaryLeafEncoder}, or `undefined` for raw.
 */
type LeafEncoding = "pin" | DictionaryLeafEncoder | undefined;

/**
 * A leaf of the nodes of one run field, and its values in these nodes.
 */
class LeafPath {
	/**
	 * The value in each node that has the leaf, in node order.
	 */
	public readonly values: Value[] = [];
	/**
	 * The number of nodes whose value is different from the value in the previous node.
	 */
	public changes = 0;
	/**
	 * How the run field writes the leaf. The run field sets it after it reads all nodes.
	 */
	public encoding: LeafEncoding;
	private previousIndex = -1;

	public constructor(public readonly leafType: TreeNodeSchemaIdentifier) {}

	/**
	 * Adds the value of the leaf in the node at `index` of the run field. Add the nodes in order.
	 */
	public add(index: number, value: Value): void {
		if (this.previousIndex === index - 1 && this.values.at(-1) !== value) {
			this.changes++;
		}
		this.values.push(value);
		this.previousIndex = index;
	}
}

/**
 * The maximum depth of the child nodes of a run field node that the strategy reads leaves from.
 */
const maxSignatureDepth = 3;

/**
 * A token of a signature: the value of a leaf, or the type of a child node.
 */
type Token = Value | TreeNodeSchemaIdentifier;

/**
 * The fields that the strategy reads from the nodes of one type, at one position in the child nodes of the nodes of a run field.
 * @remarks
 * A leaf field has a {@link LeafPath}. A child field has one path node for each type of child node.
 * The path nodes of a run field make a tree, so the encoder finds the {@link LeafPath} of a leaf without a string path.
 */
class PathNode {
	/**
	 * The fields that the strategy reads, in {@link Plan} order.
	 */
	public readonly fields: readonly FieldPath[];

	/**
	 * @param depth - The depth of the nodes in the child nodes of the nodes of the run field.
	 * @param leaves - Receives the {@link LeafPath} of each leaf field of this path node and of its child path nodes.
	 */
	public constructor(
		type: TreeNodeSchemaIdentifier,
		private readonly depth: number,
		private readonly plans: ReadonlyMap<TreeNodeSchemaIdentifier, Plan>,
		private readonly leaves: LeafPath[],
	) {
		const plan = depth < maxSignatureDepth ? plans.get(type) : undefined;
		this.fields = (plan ?? []).map((entry): FieldPath => {
			if (entry.kind === "child") {
				return { key: entry.key, polymorphic: entry.polymorphic, types: new Map() };
			}
			const leaf = new LeafPath(entry.leafType);
			leaves.push(leaf);
			return { key: entry.key, leaf };
		});
	}

	/**
	 * Adds the leaves of the node at `cursor` to their {@link LeafPath}s, and adds one {@link Token} for each field to `trace`.
	 * @param index - The index of the node in the run field.
	 * @returns `false` if a field of the node does not have exactly one node. A node like this has no signature.
	 */
	public add(cursor: ITreeCursorSynchronous, index: number, trace: Token[]): boolean {
		for (const field of this.fields) {
			cursor.enterField(field.key);
			if (cursor.getFieldLength() !== 1) {
				cursor.exitField();
				return false;
			}
			cursor.enterNode(0);
			let complete = true;
			if ("leaf" in field) {
				const value = cursor.value;
				field.leaf.add(index, value);
				trace.push(value);
			} else {
				const type = cursor.type;
				trace.push(type);
				complete = getOrCreate(
					field.types,
					type,
					() => new PathNode(type, this.depth + 1, this.plans, this.leaves),
				).add(cursor, index, trace);
			}
			cursor.exitNode();
			cursor.exitField();
			if (!complete) {
				return false;
			}
		}
		return true;
	}
}

/**
 * A field of a {@link PathNode}: a leaf field or a child field.
 */
type FieldPath =
	| { readonly key: FieldKey; readonly leaf: LeafPath }
	| {
			readonly key: FieldKey;
			readonly polymorphic: boolean;
			readonly types: Map<TreeNodeSchemaIdentifier, PathNode>;
	  };

/**
 * A node of a trie of the signatures of the nodes of one run field. Each edge is a {@link Token}.
 */
interface TrieNode {
	readonly children: Map<Token, TrieNode>;
	/**
	 * The encoder of the nodes whose signature ends at this trie node.
	 * The run field sets it at the first node with this signature.
	 */
	encoder?: NodeEncoder;
}

/**
 * Makes a {@link TrieNode} with no children.
 */
const newTrieNode = (): TrieNode => ({ children: new Map() });

/**
 * Finds the trie node where the signature of a node ends, and adds the missing trie nodes.
 * @remarks
 * Reads the tokens that {@link PathNode.add} added to `trace` for the node.
 * Uses the tokens of pinned leaves and child types, and skips the tokens of other leaves.
 * @param path - The path node of the node.
 * @param reader - The position of the next token in `trace`. The function moves it past the tokens of the node.
 */
function replaySignature(
	path: PathNode,
	node: TrieNode,
	trace: readonly Token[],
	reader: { position: number },
): TrieNode {
	let current = node;
	for (const field of path.fields) {
		const token = trace[reader.position++];
		if (!("leaf" in field)) {
			const type = token as TreeNodeSchemaIdentifier;
			const childPath = field.types.get(type) ?? fail("child type was not read");
			current = replaySignature(
				childPath,
				getOrCreate(current.children, type, newTrieNode),
				trace,
				reader,
			);
		} else if (field.leaf.encoding === "pin") {
			current = getOrCreate(current.children, token, newTrieNode);
		}
	}
	return current;
}

/**
 * The encoders that all run fields of one encode share.
 * @remarks
 * The shapes table holds one shape for each encoder object, so this class keeps one encoder object for each shape.
 */
class SharedEncoders {
	private readonly constantLeaves: NestedMap<TreeNodeSchemaIdentifier, Value, NodeEncoder> =
		new Map();
	private readonly dictionaries = new Map<string, DictionaryLeafEncoder>();
	/**
	 * The specialized encoders, by their base encoder and the encoders of their fields.
	 */
	private readonly specialized = new Map<string, NodeEncoder>();
	/**
	 * A number for each field key and encoder in the keys of {@link SharedEncoders.specialized}.
	 */
	private readonly ids = new Map<unknown, number>();

	public constructor(public readonly plans: ReadonlyMap<TreeNodeSchemaIdentifier, Plan>) {}

	/**
	 * Gets the encoder of a leaf of type `leafType` with the constant `value`.
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
	 * Gets the {@link DictionaryLeafEncoder} for leaves of type `leafType` with the values in `admitted`.
	 */
	public dictionary(
		leafType: TreeNodeSchemaIdentifier,
		admitted: readonly Value[],
	): DictionaryLeafEncoder {
		const values = admitted.map((value) => JSON.stringify(value)).sort();
		return getOrCreate(
			this.dictionaries,
			`${leafType}:${JSON.stringify(values)}`,
			() =>
				new DictionaryLeafEncoder(
					leafType,
					new Map(admitted.map((value) => [value, this.constantLeaf(leafType, value)])),
				),
		);
	}

	/**
	 * Gets the specialized encoder for the node at `cursor`.
	 * @remarks
	 * The shape keeps each pinned leaf as a constant, and writes each dictionary leaf with its {@link DictionaryLeafEncoder}.
	 * It keeps the encoder of a child node if the child is specialized or its field allows more than one type.
	 * Incremental fields keep their encoder.
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
		if (!(base instanceof NodeShapeBasedEncoder)) {
			return base;
		}
		const overrides: KeyedFieldEncoder[] = [];
		let key = `${this.id(base)}`;
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
			if ("leaf" in field) {
				const encoding = field.leaf.encoding;
				override =
					encoding === "pin" ? this.constantLeaf(field.leaf.leafType, cursor.value) : encoding;
			} else {
				const childBase = context.nodeEncoderFromSchema(cursor.type);
				const childPath = field.types.get(cursor.type) ?? fail("child type was not read");
				const child = this.specialize(cursor, childBase, childPath, context);
				override = field.polymorphic || child !== childBase ? child : undefined;
			}
			cursor.exitNode();
			cursor.exitField();
			if (override !== undefined) {
				overrides.push({
					key: field.key,
					encoder:
						override instanceof DictionaryLeafEncoder ? override : asFieldEncoder(override),
				});
				key += `,${this.id(field.key)}=${this.id(override)}`;
			}
		}
		return overrides.length === 0
			? base
			: getOrCreate(
					this.specialized,
					key,
					() => new SpecializedNodeShapeEncoder(base, overrides),
				);
	}

	private id(value: unknown): number {
		return getOrCreate(this.ids, value, () => this.ids.size);
	}
}

/**
 * The strategy pins a leaf if its value changes at most one time in this number of nodes, on average.
 * @remarks
 * Each change of a pinned leaf starts a new run, and each value of a pinned leaf adds shapes.
 */
const minAverageRunLength = 8;

/**
 * The approximate number of bytes that one constant leaf shape adds to the shapes table.
 */
const dictionaryEntryBytes = 32;

/**
 * The approximate average number of bytes of a shape index and its comma in the data.
 */
const averageIndexBytes = 2.5;

/**
 * The maximum number of different values of a leaf that the strategy counts.
 * @remarks
 * Other values are not in the dictionary. This limits the time and memory for leaves with many values.
 */
const maxCountedValues = 1000;

/**
 * The minimum part of the nodes of a leaf that must have a value in the dictionary, for the leaf to use the dictionary.
 * @remarks
 * A value that is not in the dictionary writes one more shape index than a raw value.
 */
const minDictionaryCoverage = 0.75;

/**
 * Returns true if a value in `count` nodes saves more bytes in the data than its constant leaf shape adds to the shapes table.
 * @param jsonLength - The length of the value as JSON.
 */
function savesBytes(count: number, jsonLength: number): boolean {
	return count * (jsonLength + 1 - averageIndexBytes) > dictionaryEntryBytes;
}

/**
 * Chooses how a run field writes a leaf.
 * @remarks
 * Returns "pin" if the leaf changes rarely.
 * If not, admits each value that {@link savesBytes}, to a maximum of {@link maxCountedValues} different values.
 * Returns a dictionary of these values if they cover enough nodes, and `undefined` (raw) if not.
 * A fast maximum JSON length removes most values before the exact length is calculated.
 */
function chooseLeafEncoding(leaf: LeafPath, shared: SharedEncoders): LeafEncoding {
	const count = leaf.values.length;
	if (leaf.changes * minAverageRunLength <= count) {
		return "pin";
	}
	const counts = new Map<Value, number>();
	for (const value of leaf.values) {
		const valueCount = counts.get(value);
		if (valueCount !== undefined) {
			counts.set(value, valueCount + 1);
		} else if (counts.size < maxCountedValues) {
			counts.set(value, 1);
		}
	}
	const admitted: Value[] = [];
	let covered = 0;
	for (const [value, valueCount] of counts) {
		const maxJsonLength = typeof value === "string" ? value.length * 6 + 2 : 24;
		if (
			savesBytes(valueCount, maxJsonLength) &&
			savesBytes(valueCount, JSON.stringify(value).length)
		) {
			admitted.push(value);
			covered += valueCount;
		}
	}
	return covered >= count * minDictionaryCoverage
		? shared.dictionary(leaf.leafType, admitted)
		: undefined;
}

/**
 * The shape of the data of a run field: a nested array where each item starts with its shape.
 */
const runFieldShape = new NestedArrayShape(AnyShape.instance);

/**
 * Writes a run field.
 * @remarks
 * Reads the leaves of each node one time, to choose how to write each leaf and to record the signature of each node.
 * Then it chooses the shape of each node from its signature, and writes the runs.
 */
class RunFieldEncoder implements FieldEncoder {
	public readonly shape = runFieldShape;

	/**
	 * @param elementType - The type of the nodes of the field.
	 */
	public constructor(
		private readonly shared: SharedEncoders,
		private readonly elementType: TreeNodeSchemaIdentifier,
	) {}

	/**
	 * Writes the field at `cursor`.
	 * @remarks
	 * An empty field writes 0, as the format requires for an empty nested array.
	 * If the nodes are leaves, the encoder writes their values without the cursor:
	 * a constant leaf has no data, and the base leaf has only its value.
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
		const base = context.nodeEncoderFromSchema(this.elementType);
		if (this.shared.plans.has(this.elementType)) {
			const choices = this.chooseNodeEncoders(cursor, base, context);
			cursor.firstNode();
			outputBuffer.push(
				this.encodeRuns(choices, context, (encoder, buffer) => {
					encoder.encodeNode(cursor, context, buffer);
					cursor.nextNode();
				}),
			);
			return;
		}
		const leaf = new LeafPath(this.elementType);
		let index = 0;
		forEachNode(cursor, () => leaf.add(index++, cursor.value));
		const encoding = chooseLeafEncoding(leaf, this.shared);
		const leafChoices = leaf.values.map((value) =>
			encoding === "pin"
				? this.shared.constantLeaf(this.elementType, value)
				: (encoding?.encoders.get(value) ?? base),
		);
		outputBuffer.push(
			this.encodeRuns(leafChoices, context, (encoder, buffer, node) => {
				if (encoder === base) {
					buffer.push(leaf.values[node] as TreeValue);
				}
			}),
		);
	}

	/**
	 * Writes the runs of nodes with the same encoder.
	 * @remarks
	 * A run of one node writes the node shape and the node data.
	 * A longer run writes a nested array shape and an array of the data of its nodes.
	 * If the nodes have no data, the run writes the number of nodes in place of the array.
	 * All nodes of a run have the same shape, so all of them have data or none of them do.
	 * @param choices - The encoder of each node of the field.
	 * @param encodeNode - Writes the node at `index` with `encoder` to `buffer`. It is called for each node, in order.
	 * @returns The data of the field.
	 */
	private encodeRuns(
		choices: readonly NodeEncoder[],
		context: EncoderContext,
		encodeNode: (encoder: NodeEncoder, buffer: BufferFormat, index: number) => void,
	): BufferFormat {
		const buffer: BufferFormat = [];
		for (let start = 0; start < choices.length; ) {
			const encoder = choices[start] ?? fail("missing choice");
			let end = start + 1;
			for (; end < choices.length; end++) {
				if (choices[end] !== encoder) {
					break;
				}
			}
			if (end - start === 1) {
				buffer.push(encoder.shape);
				encodeNode(encoder, buffer, start);
			} else {
				buffer.push(context.nestedArrayEncoder(encoder).shape);
				const items: BufferFormat = [];
				for (let index = start; index < end; index++) {
					encodeNode(encoder, items, index);
				}
				buffer.push(items.length === 0 ? end - start : items);
			}
			start = end;
		}
		return buffer;
	}

	/**
	 * Chooses the encoder of each node of a field of object nodes.
	 * @remarks
	 * A node without a signature, and every node when all leaves are raw, uses `base`.
	 * The cursor reads a node again only for the first node with each signature, to make its specialized encoder.
	 */
	private chooseNodeEncoders(
		cursor: ITreeCursorSynchronous,
		base: NodeEncoder,
		context: EncoderContext,
	): NodeEncoder[] {
		const leaves: LeafPath[] = [];
		const root = new PathNode(this.elementType, 0, this.shared.plans, leaves);
		const trace: Token[] = [];
		const starts: number[] = [];
		forEachNode(cursor, () => {
			const start = trace.length;
			if (root.add(cursor, starts.length, trace)) {
				starts.push(start);
			} else {
				trace.length = start;
				starts.push(-1);
			}
		});
		let allRaw = true;
		for (const leaf of leaves) {
			leaf.encoding = chooseLeafEncoding(leaf, this.shared);
			allRaw &&= leaf.encoding === undefined;
		}
		if (allRaw) {
			return starts.map(() => base);
		}

		const trie = newTrieNode();
		const reader = { position: 0 };
		return starts.map((start, index) => {
			if (start < 0) {
				return base;
			}
			reader.position = start;
			const match = replaySignature(root, trie, trace, reader);
			if (match.encoder === undefined) {
				cursor.enterNode(index);
				match.encoder = this.shared.specialize(cursor, base, root, context);
				cursor.exitNode();
			}
			return match.encoder;
		});
	}
}
