/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

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
 * The maximum depth below a node of a run field that the strategy reads leaf values from.
 */
const maxSignatureDepth = 3;

/**
 * The minimum average number of consecutive nodes with the same value of a leaf, for the strategy to pin the leaf.
 * @remarks
 * A pinned leaf starts a new run each time its value changes, so the leaf must change rarely.
 * This also limits the number of shapes of a pinned leaf to one for each `minAverageRunLength` nodes.
 */
const minAverageRunLength = 8;

/**
 * The approximate number of bytes that one constant leaf shape adds to the shapes table.
 */
const dictionaryEntryBytes = 32;

/**
 * The approximate average number of bytes of a shape index in the data, including its comma.
 * @remarks
 * The shapes table is sorted by use, so the most common values get indexes with one digit.
 */
const averageIndexBytes = 2.5;

/**
 * The minimum fraction of the nodes of a leaf that must have a value in the dictionary,
 * for the strategy to use a dictionary for the leaf.
 * @remarks
 * A value that is not in the dictionary costs a shape index more than it costs without a dictionary.
 */
const minDictionaryCoverage = 0.75;

/**
 * A required field of an object node type that the strategy reads.
 * @remarks
 * A "value" field holds one string, number or boolean leaf.
 * A "child" field holds one node, which the strategy reads in turn.
 */
type PlanEntry =
	| {
			readonly kind: "value";
			readonly key: FieldKey;
			readonly leafType: TreeNodeSchemaIdentifier;
	  }
	| { readonly kind: "child"; readonly key: FieldKey; readonly polymorphic: boolean };

/**
 * The fields that the strategy reads for one object node type, in field order.
 */
type Plan = readonly PlanEntry[];

/**
 * How a run field encodes one leaf of its nodes.
 * @remarks
 * A leaf is identified by its path from the node of the run field.
 * - "pin": the value is a constant of the specialized shape of the node. Nodes with different values have different shapes.
 * - "dictionary": the field of the leaf has the polymorphic shape.
 * Each value in the dictionary is a constant leaf shape, so the data holds only the index of that shape.
 * Other values use the base leaf shape, so the data holds the shape index and the value.
 * - "raw": the base shape encodes the leaf.
 */
type LeafEncoding =
	| { readonly kind: "pin" }
	| { readonly kind: "dictionary"; readonly encoder: DictionaryLeafEncoder }
	| { readonly kind: "raw" };

/**
 * The statistics of one leaf over the nodes of one run field.
 */
interface LeafStatistics {
	readonly leafType: TreeNodeSchemaIdentifier;
	/**
	 * The number of nodes that have the leaf.
	 */
	count: number;
	/**
	 * The number of nodes that have the leaf with a different value than the previous node.
	 */
	changes: number;
	/**
	 * The number of nodes with each value.
	 */
	readonly values: Map<Value, number>;
}

/**
 * The path of the value of a run field node that is itself a leaf.
 */
const ownValuePath = "";

/**
 * Creates a {@link SpecializationStrategy} that chooses, for each leaf of the nodes of a sequence field,
 * whether to pin it, encode it with a dictionary, or leave it raw.
 * @remarks
 * The strategy applies to sequence fields that allow only one type, for example the atoms of text.
 * It does not read the batch before the encode.
 * Instead, the encoder of each of these fields reads the nodes of the field before it encodes them,
 * and counts how often each leaf changes between consecutive nodes, and how often each value occurs.
 *
 * - A leaf that changes rarely, such as the format of text, is pinned.
 * Consecutive nodes with the same pinned values use one shape, and the encoder writes them as one run.
 * - A leaf that changes often, but has a small set of common values, such as the characters of text,
 * uses a dictionary of constant leaf shapes. The data of each node holds only a shape index.
 * - Other leaves are written as they are.
 *
 * The encoder writes each run of two or more nodes as a nested array of the shape of the run.
 * A run of nodes with no data, for example nodes with all leaves pinned, is written as its length.
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
			const keys = runFields.get(schemaName);
			if (keys === undefined) {
				return base;
			}
			return new NodeShapeBasedEncoder(
				base.type,
				base.value,
				base.specializedFieldEncoders.map((field) =>
					// The incremental encoder encodes incremental fields separately, so they keep their encoder.
					keys.has(field.key) && field.encoder !== incrementalFieldEncoder
						? { key: field.key, encoder: new RunFieldEncoder(shared) }
						: field,
				),
				base.otherFieldsEncoder,
			);
		};
	};
}

/**
 * The encoders and caches that all encoders of one encode share.
 * @remarks
 * Each shape has only one encoder, so the shapes table holds each shape one time.
 */
class SharedEncoders {
	private readonly constantLeaves: NestedMap<
		TreeNodeSchemaIdentifier,
		Value,
		NodeShapeBasedEncoder
	> = new Map();
	private readonly specialized = new Map<string, NodeEncoder>();
	private readonly fieldEncoders = new Map<NodeEncoder, FieldEncoder>();
	private readonly runShapes = new Map<NodeEncoder, NestedArrayShape>();
	private readonly dictionaries = new Map<string, DictionaryLeafEncoder>();
	private readonly incrementalKeys = new Map<NodeShapeBasedEncoder, ReadonlySet<FieldKey>>();

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
	 * Gets the shape of a run of nodes that `encoder` encodes.
	 */
	public runShape(encoder: NodeEncoder): NestedArrayShape {
		return getOrCreate(this.runShapes, encoder, () => new NestedArrayShape(encoder.shape));
	}

	/**
	 * Gets the dictionary encoder for leaves of type `leafType` with the values in `admitted`.
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
				new DictionaryLeafEncoder(this.dictionaries.size, leafType, new Set(admitted), this),
		);
	}

	/**
	 * Gets the specialized encoder for the node at `cursor`.
	 * @param base - The encoder of the type of the node, from the context.
	 * @param path - The path of the node from the node of the run field.
	 * @param encodings - The encoding of each leaf of the nodes of the run field, by path.
	 * @returns The encoder, and a key that is the same for nodes with the same encoder.
	 */
	public specialize(
		cursor: ITreeCursorSynchronous,
		base: NodeEncoder,
		depth: number,
		path: string,
		encodings: ReadonlyMap<string, LeafEncoding>,
		context: EncoderContext,
	): { encoder: NodeEncoder; key: string } {
		const ownEncoding = depth === 0 ? encodings.get(ownValuePath) : undefined;
		if (ownEncoding !== undefined) {
			// The node is a leaf.
			// Only nodes of a run field are leaves with an encoding, and the run field does not use their key.
			const value = cursor.value;
			const leafEncoder =
				ownEncoding.kind === "pin" ||
				(ownEncoding.kind === "dictionary" && ownEncoding.encoder.admitted.has(value))
					? this.constantLeaf(cursor.type, value)
					: base;
			return { encoder: leafEncoder, key: cursor.type };
		}

		const plan = depth < maxSignatureDepth ? this.plans.get(cursor.type) : undefined;
		if (plan === undefined || !(base instanceof NodeShapeBasedEncoder)) {
			return { encoder: base, key: cursor.type };
		}
		const incremental = getOrCreate(
			this.incrementalKeys,
			base,
			() =>
				new Set(
					base.specializedFieldEncoders
						.filter((field) => field.encoder === incrementalFieldEncoder)
						.map((field) => field.key),
				),
		);
		const overrides: KeyedFieldEncoder[] = [];
		let key = `${cursor.type}(`;
		for (const entry of plan) {
			// The incremental encoder encodes incremental fields separately, so they keep their encoder.
			if (incremental.has(entry.key)) {
				continue;
			}
			cursor.enterField(entry.key);
			if (cursor.getFieldLength() !== 1) {
				cursor.exitField();
				return { encoder: base, key: cursor.type };
			}
			cursor.enterNode(0);
			if (entry.kind === "value") {
				const encoding = encodings.get(`${path}/${entry.key}`);
				if (encoding?.kind === "pin") {
					key += `${JSON.stringify(cursor.value)},`;
					overrides.push({
						key: entry.key,
						encoder: this.asField(this.constantLeaf(entry.leafType, cursor.value)),
					});
				} else if (encoding?.kind === "dictionary") {
					key += `~${encoding.encoder.id},`;
					overrides.push({ key: entry.key, encoder: encoding.encoder });
				} else {
					key += "_,";
				}
			} else {
				const childBase = context.nodeEncoderFromSchema(cursor.type);
				const child = this.specialize(
					cursor,
					childBase,
					depth + 1,
					`${path}/${entry.key}:${cursor.type}`,
					encodings,
					context,
				);
				// The "@" makes the key of a child different from a JSON value.
				key += `@${child.key},`;
				if (entry.polymorphic || child.encoder !== childBase) {
					overrides.push({ key: entry.key, encoder: this.asField(child.encoder) });
				}
			}
			cursor.exitNode();
			cursor.exitField();
		}
		if (overrides.length === 0) {
			return { encoder: base, key: cursor.type };
		}
		key += ")";
		const encoder = getOrCreate(
			this.specialized,
			key,
			() => new SpecializedNodeShapeEncoder(base, overrides),
		);
		return { encoder, key };
	}

	private asField(encoder: NodeEncoder): FieldEncoder {
		return getOrCreate(this.fieldEncoders, encoder, () => asFieldEncoder(encoder));
	}
}

/**
 * Encodes a field of one leaf with a dictionary of constant leaf shapes.
 * @remarks
 * The shape of the field is polymorphic, so the data of each leaf starts with the index of its shape.
 * A value in the dictionary uses its constant leaf shape, so the data holds only the index.
 * Another value uses the base leaf shape, so the data also holds the value.
 */
class DictionaryLeafEncoder implements FieldEncoder {
	public constructor(
		/**
		 * A number that is different for each dictionary of an encode.
		 */
		public readonly id: number,
		private readonly leafType: TreeNodeSchemaIdentifier,
		public readonly admitted: ReadonlySet<Value>,
		private readonly shared: SharedEncoders,
	) {}

	public get shape(): AnyShape {
		return AnyShape.instance;
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		forEachNode(cursor, () => {
			const value = cursor.value;
			const encoder = this.admitted.has(value)
				? this.shared.constantLeaf(this.leafType, value)
				: context.nodeEncoderFromSchema(this.leafType);
			AnyShape.encodeNode(cursor, context, outputBuffer, encoder);
		});
	}
}

/**
 * The shape of a field that {@link RunFieldEncoder} encodes.
 * @remarks
 * This shape is a nested array. Each item of the array starts with its shape.
 */
const runFieldShape = new NestedArrayShape(AnyShape.instance);

/**
 * Encodes a sequence field of one type, and writes consecutive nodes with the same shape as one run.
 * @remarks
 * The encoder reads the nodes of the field three times:
 * to choose the encoding of each leaf, to choose the shape of each node, and to encode the runs.
 *
 * Each item of the nested array starts with a shape.
 * For one node, this shape is the shape of the node, and the data of the node follows.
 * For a run of nodes, this shape is a nested array of the shape of the node, and a nested array with the data of all nodes follows.
 * If the nodes have no data, the length of the run replaces this nested array.
 */
class RunFieldEncoder implements FieldEncoder {
	public constructor(private readonly shared: SharedEncoders) {}

	public get shape(): NestedArrayShape {
		return runFieldShape;
	}

	public encodeField(
		cursor: ITreeCursorSynchronous,
		context: EncoderContext,
		outputBuffer: BufferFormat,
	): void {
		const length = cursor.getFieldLength();
		if (length === 0) {
			// The format encodes a nested array with no items as its length.
			outputBuffer.push(0);
			return;
		}

		const encodings = this.chooseEncodings(cursor);
		const choices: NodeEncoder[] = [];
		// If all leaves are raw, all nodes use the base shape of their type, so the encoder does not read their leaves again.
		const allRaw = [...encodings.values()].every((encoding) => encoding.kind === "raw");
		forEachNode(cursor, () => {
			const base = context.nodeEncoderFromSchema(cursor.type);
			choices.push(
				allRaw
					? base
					: this.shared.specialize(cursor, base, 0, ownValuePath, encodings, context).encoder,
			);
		});

		const buffer: BufferFormat = [];
		cursor.firstNode();
		for (let start = 0; start < length; ) {
			const encoder = choices[start] ?? fail("missing choice");
			let end = start + 1;
			for (; end < length; end++) {
				if (choices[end] !== encoder) {
					break;
				}
			}
			// Each branch moves the cursor to the node after the run.
			if (end - start === 1) {
				AnyShape.encodeNode(cursor, context, buffer, encoder);
				cursor.nextNode();
			} else {
				buffer.push(this.shared.runShape(encoder));
				const items: BufferFormat = [];
				let allNonZeroSize = true;
				for (let index = start; index < end; index++) {
					const before = items.length;
					encoder.encodeNode(cursor, context, items);
					allNonZeroSize &&= items.length !== before;
					cursor.nextNode();
				}
				if (items.length === 0) {
					buffer.push(end - start);
				} else {
					assert(allNonZeroSize, "all nodes of a run must have data, or none of them");
					buffer.push(items);
				}
			}
			start = end;
		}
		outputBuffer.push(buffer);
	}

	/**
	 * Reads the nodes of the field at `cursor`, and chooses the encoding of each leaf.
	 * @returns The encoding of each leaf, by path.
	 */
	private chooseEncodings(cursor: ITreeCursorSynchronous): Map<string, LeafEncoding> {
		cursor.enterNode(0);
		const type = cursor.type;
		const isLeaf = !this.shared.plans.has(type) && cursor.value !== undefined;
		cursor.exitNode();
		if (isLeaf) {
			// Fast path for a field of leaves, which has only one path.
			const leaf: LeafStatistics = { leafType: type, count: 0, changes: 0, values: new Map() };
			let previousValue: Value;
			forEachNode(cursor, () => {
				const value = cursor.value;
				if (leaf.count > 0 && value !== previousValue) {
					leaf.changes++;
				}
				leaf.count++;
				leaf.values.set(value, (leaf.values.get(value) ?? 0) + 1);
				previousValue = value;
			});
			return new Map([[ownValuePath, this.chooseEncoding(leaf)]]);
		}

		const statistics = new Map<string, LeafStatistics>();
		let previous = new Map<string, Value>();
		let current = new Map<string, Value>();
		forEachNode(cursor, () => {
			current.clear();
			readLeaves(cursor, this.shared.plans, (path, leafType, value) => {
				const leaf = getOrCreate(statistics, path, () => ({
					leafType,
					count: 0,
					changes: 0,
					values: new Map<Value, number>(),
				}));
				leaf.count++;
				leaf.values.set(value, (leaf.values.get(value) ?? 0) + 1);
				if (previous.has(path) && previous.get(path) !== value) {
					leaf.changes++;
				}
				current.set(path, value);
			});
			[previous, current] = [current, previous];
		});

		const encodings = new Map<string, LeafEncoding>();
		for (const [path, leaf] of statistics) {
			encodings.set(path, this.chooseEncoding(leaf));
		}
		return encodings;
	}

	/**
	 * Chooses the encoding of one leaf from its statistics.
	 */
	private chooseEncoding(leaf: LeafStatistics): LeafEncoding {
		if (leaf.changes * minAverageRunLength <= leaf.count) {
			return { kind: "pin" };
		}
		// A value is in the dictionary if the bytes it saves in the data are more than the bytes of its shape.
		const admitted: Value[] = [];
		let covered = 0;
		for (const [value, count] of leaf.values) {
			const savedBytes = JSON.stringify(value).length + 1 - averageIndexBytes;
			if (count * savedBytes > dictionaryEntryBytes) {
				admitted.push(value);
				covered += count;
			}
		}
		if (covered >= leaf.count * minDictionaryCoverage) {
			return { kind: "dictionary", encoder: this.shared.dictionary(leaf.leafType, admitted) };
		}
		return { kind: "raw" };
	}
}

/**
 * Calls `visit` for each leaf that the strategy reads from the node at `cursor`.
 * @remarks
 * If the node is a leaf, its path is {@link ownValuePath}.
 * The path of a leaf below the node includes the key of each field and the type of each node on the way to the leaf.
 * The function puts the cursor back where it was.
 */
function readLeaves(
	cursor: ITreeCursorSynchronous,
	plans: ReadonlyMap<TreeNodeSchemaIdentifier, Plan>,
	visit: (path: string, leafType: TreeNodeSchemaIdentifier, value: Value) => void,
): void {
	if (!plans.has(cursor.type)) {
		if (cursor.value !== undefined) {
			visit(ownValuePath, cursor.type, cursor.value);
		}
		return;
	}
	const read = (path: string, depth: number): void => {
		const plan = depth < maxSignatureDepth ? plans.get(cursor.type) : undefined;
		for (const entry of plan ?? []) {
			cursor.enterField(entry.key);
			if (cursor.getFieldLength() === 1) {
				cursor.enterNode(0);
				if (entry.kind === "value") {
					visit(`${path}/${entry.key}`, entry.leafType, cursor.value);
				} else {
					read(`${path}/${entry.key}:${cursor.type}`, depth + 1);
				}
				cursor.exitNode();
			}
			cursor.exitField();
		}
	};
	read(ownValuePath, 0);
}

/**
 * Returns true if `nodeSchema` is a leaf with a string, number or boolean value.
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
 * A plan includes the required fields that are not identifier fields,
 * if they hold a string, number or boolean leaf, or an object node, or allow more than one type.
 * Types without fields in their plan are not in the result.
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
 * Finds the sequence fields that allow only one type,
 * if that type has a plan or is a leaf with a string, number or boolean value.
 * @returns The keys of these fields, by node type.
 */
function findRunFields(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	plans: ReadonlyMap<TreeNodeSchemaIdentifier, Plan>,
): Map<TreeNodeSchemaIdentifier, Set<FieldKey>> {
	const result = new Map<TreeNodeSchemaIdentifier, Set<FieldKey>>();
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
				getOrCreate(result, type, () => new Set()).add(key);
			}
		}
	}
	return result;
}
