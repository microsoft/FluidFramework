/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type FieldKey,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../core/index.js";

import type { ShapeInfo } from "./chunkTree.js";
import type { IncrementalEncodingPolicy } from "./codec/index.js";
import { type FieldShape, TreeShape } from "./uniformChunk.js";

/**
 * Bounds on the memory a {@link ContentShapeCache} may use.
 *
 * @remarks
 * When a bound is reached, content that would need a new cache entry is chunked as if the cache were not in use
 * (typically as {@link BasicChunk}s); content matching existing entries keeps using them.
 *
 * The per-type bounds keep a single type with unbounded variety
 * (for example a map with unique keys, or an object with many combinations of optional fields)
 * from using up the budget of all other types.
 */
export interface ContentShapeLimits {
	/**
	 * Maximum number of children a field may have within a content-derived shape.
	 *
	 * @remarks
	 * Every distinct length of a field is a distinct shape, so allowing longer fields multiplies the number of shapes
	 * while packing few additional nodes.
	 */
	readonly maxFieldLength: number;
	/**
	 * Maximum number of content-derived shapes.
	 */
	readonly maxShapes: number;
	/**
	 * Maximum total, over all content-derived shapes, of their {@link TreeShape.nodeCount}s.
	 *
	 * @remarks
	 * A shape retains one {@link TreeShape.positions} object per node once a chunk with that shape is read,
	 * so this bounds the memory used by the shapes themselves.
	 */
	readonly maxPositions: number;
	/**
	 * Maximum number of distinct layouts (including layouts of the first fields of a node) tracked.
	 */
	readonly maxLayouts: number;
	/**
	 * Maximum number of distinct field keys tracked.
	 */
	readonly maxFieldKeys: number;
	/**
	 * Maximum number of content-derived shapes for any one node type.
	 */
	readonly maxShapesPerType: number;
	/**
	 * Maximum number of layouts tracked for any one node type.
	 */
	readonly maxLayoutsPerType: number;
}

/**
 * Default {@link ContentShapeLimits}.
 *
 * @remarks
 * With these limits, the cache uses at most a few megabytes, most of it for the positions of its shapes.
 */
export const defaultContentShapeLimits: ContentShapeLimits = {
	maxFieldLength: 1,
	maxShapes: 2048,
	maxPositions: 65536,
	maxLayouts: 16384,
	maxFieldKeys: 4096,
	maxShapesPerType: 128,
	maxLayoutsPerType: 1024,
};

/**
 * Exclusive upper bound on the ids {@link ContentShapeCache} assigns to child shapes.
 *
 * @remarks
 * Child shapes are the schema-derived shapes and the content-derived shapes of one chunker, so this is never reached
 * in practice. Reaching it only stops new layouts from being added.
 */
const maxChildShapeIds = 2 ** 20;

/**
 * A node type and the shapes of its first fields: one state of the trie in {@link ContentShapeCache}.
 */
export class ContentLayout {
	/**
	 * The layout of this node type with no fields, which also counts the layouts and shapes of its type.
	 */
	public readonly typeRoot: ContentLayout;

	/**
	 * Number of layouts for this type, not counting `typeRoot`. Only maintained on `typeRoot`.
	 */
	public typeLayouts = 0;

	/**
	 * Number of shapes for this type. Only maintained on `typeRoot`.
	 */
	public typeShapes = 0;

	/**
	 * Layouts with one more field, keyed by {@link ContentShapeCache.transitionKey}.
	 * `false` when that field can not be part of a shape.
	 */
	public next: Map<number, ContentLayout | false> | undefined;

	/**
	 * The shape of a node whose fields are exactly those of this layout:
	 * `undefined` until requested and `false` when it can not be created.
	 */
	public shape: TreeShape | false | undefined;

	public constructor(
		/**
		 * The layout without its last field, or `undefined` for a type's layout without fields.
		 */
		public readonly parent: ContentLayout | undefined,
		/**
		 * The last field of this layout, or `undefined` for a type's layout without fields.
		 */
		public readonly field: FieldShape | undefined,
		/**
		 * Number of nodes in a tree with this layout.
		 */
		public readonly positions: number,
	) {
		this.typeRoot = parent?.typeRoot ?? this;
	}
}

/**
 * Derives and interns {@link TreeShape}s from tree content, for trees whose schema allows several shapes.
 *
 * @remarks
 * A shape derived from schema (see `tryShapeFromNodeSchema`) only exists when the schema fixes the layout of the
 * whole subtree. Much content does not qualify (any optional field, sequence field or field allowing several types
 * prevents it), yet many such subtrees share a few concrete layouts. This cache provides shapes for those layouts.
 *
 * A node can have a content-derived shape when it has no value and each of its fields holds between one and
 * {@link ContentShapeLimits.maxFieldLength} children which all have the same shape.
 * The shape is determined by the node's type and, for each of its fields in order, the field's key, the shape of its
 * children and their number.
 * Fields which are encoded incrementally (see {@link IncrementalEncodingPolicy}) are never part of a shape,
 * so that their content keeps its own chunks.
 *
 * Shapes are interned in a trie of {@link ContentLayout}s: one root per node type, and one transition per field.
 * Equal layouts therefore get the same {@link TreeShape} instance, found with one map lookup per field.
 * Layouts which can not have a shape are remembered as well, so content that never fits is rejected quickly.
 *
 * The cache's size is bounded by {@link ContentShapeLimits}.
 * Its entries depend on the stored schema and on the schema-derived shapes it was used with,
 * so it must be discarded when the schema changes.
 */
export class ContentShapeCache {
	private readonly roots: Map<TreeNodeSchemaIdentifier, ContentLayout> = new Map();
	private readonly fieldKeyIds: Map<FieldKey, number> = new Map();
	private readonly childShapeIds: Map<TreeShape, number> = new Map();
	/**
	 * The shapes this cache created.
	 */
	private readonly shapes: Set<TreeShape> = new Set();
	/**
	 * Results of {@link ContentShapeCache.internShape} for shapes this cache did not create.
	 */
	private readonly interned: WeakMap<TreeShape, TreeShape | false> = new WeakMap();
	private readonly fieldLengthRadix: number;
	private layoutCount = 0;
	private shapeCount = 0;
	private positionCount = 0;

	public constructor(
		/**
		 * The stored schema of the content, used to interpret {@link ContentShapeCache.shouldEncodeIncrementally}.
		 */
		private readonly schema: TreeStoredSchema,
		/**
		 * Policy for which fields are encoded incrementally: such fields are never part of a shape.
		 */
		private readonly shouldEncodeIncrementally: IncrementalEncodingPolicy,
		/**
		 * Maximum number of nodes in a content-derived shape.
		 */
		private readonly maxShapeNodes: number,
		private readonly limits: ContentShapeLimits,
	) {
		this.fieldLengthRadix = limits.maxFieldLength + 1;
		assert(
			limits.maxFieldLength >= 1 &&
				Number.isSafeInteger(limits.maxFieldKeys * maxChildShapeIds * this.fieldLengthRadix),
			"ContentShapeLimits out of supported range",
		);
	}

	/**
	 * Whether a field holding `length` children can be part of a content-derived shape.
	 */
	public allowsFieldLength(length: number): boolean {
		return length <= this.limits.maxFieldLength;
	}

	/**
	 * Gets a shape with the same layout as `shape` (so the same values) whose instance this cache uses:
	 * `shape` itself if this cache created it, the schema-derived shape of its type if equal to it,
	 * or else the content-derived shape for its layout.
	 *
	 * @param shapeFromSchema - The schema-derived shapes of the cache's chunker.
	 * @returns The shape, or `undefined` if there is none and the cache can not create it.
	 *
	 * @remarks
	 * This lets content held in existing {@link UniformChunk}s with other shape instances
	 * (for example those built when decoding a summary) be part of content-derived shapes.
	 * The fields of the returned shape are in the order of those of `shape`.
	 */
	public internShape(
		shape: TreeShape,
		shapeFromSchema: (type: TreeNodeSchemaIdentifier) => ShapeInfo,
	): TreeShape | undefined {
		if (this.shapes.has(shape)) {
			return shape;
		}
		let result = this.interned.get(shape);
		if (result === undefined) {
			result = this.internNewShape(shape, shapeFromSchema) ?? false;
			this.interned.set(shape, result);
		}
		return result === false ? undefined : result;
	}

	private internNewShape(
		shape: TreeShape,
		shapeFromSchema: (type: TreeNodeSchemaIdentifier) => ShapeInfo,
	): TreeShape | undefined {
		const schemaShape = shapeFromSchema(shape.type);
		if (schemaShape instanceof TreeShape && schemaShape.equals(shape)) {
			return schemaShape;
		}
		if (shape.hasValue) {
			return undefined;
		}
		let layout = this.layoutForType(shape.type);
		for (const [key, child, length] of shape.fieldsArray) {
			if (layout === undefined) {
				return undefined;
			}
			const childShape = this.internShape(child, shapeFromSchema);
			if (childShape === undefined) {
				return undefined;
			}
			layout = this.addField(layout, shape.type, key, childShape, length);
		}
		return layout === undefined ? undefined : this.shapeForLayout(layout, shape.type);
	}

	/**
	 * Gets the layout of a node of type `type` with no fields,
	 * or `undefined` if the cache is full and has no layouts for this type.
	 */
	public layoutForType(type: TreeNodeSchemaIdentifier): ContentLayout | undefined {
		let layout = this.roots.get(type);
		if (layout === undefined) {
			if (this.layoutCount >= this.limits.maxLayouts) {
				return undefined;
			}
			this.layoutCount++;
			layout = new ContentLayout(undefined, undefined, 1);
			this.roots.set(type, layout);
		}
		return layout;
	}

	/**
	 * Gets the layout which extends `layout` (of a node of type `type`) with the field `key`,
	 * holding `length` children of shape `childShape`.
	 *
	 * @returns The extended layout, or `undefined` if a node with this layout can not have a shape.
	 */
	public addField(
		layout: ContentLayout,
		type: TreeNodeSchemaIdentifier,
		key: FieldKey,
		childShape: TreeShape,
		length: number,
	): ContentLayout | undefined {
		if (length > this.limits.maxFieldLength) {
			return undefined;
		}
		const knownTransition = this.transitionKey(key, childShape, length, false);
		if (knownTransition !== undefined) {
			const existing = layout.next?.get(knownTransition);
			if (existing !== undefined) {
				return existing === false ? undefined : existing;
			}
		}
		const typeRoot = layout.typeRoot;
		if (
			this.layoutCount >= this.limits.maxLayouts ||
			typeRoot.typeLayouts >= this.limits.maxLayoutsPerType
		) {
			return undefined;
		}
		// Ids are only assigned for new layouts, so content which can't add layouts does not use up ids other types need.
		const transition = knownTransition ?? this.transitionKey(key, childShape, length, true);
		if (transition === undefined) {
			return undefined;
		}
		layout.next ??= new Map();
		this.layoutCount++;
		typeRoot.typeLayouts++;
		const positions = layout.positions + length * childShape.nodeCount;
		const extended =
			positions > this.maxShapeNodes || this.isIncremental(type, key)
				? false
				: new ContentLayout(layout, [key, childShape, length], positions);
		layout.next.set(transition, extended);
		return extended === false ? undefined : extended;
	}

	/**
	 * Gets the shape of a node of type `type` whose fields are exactly those of `layout`.
	 *
	 * @returns The shape, or `undefined` if there is none and the cache can not create it.
	 */
	public shapeForLayout(
		layout: ContentLayout,
		type: TreeNodeSchemaIdentifier,
	): TreeShape | undefined {
		if (layout.shape !== undefined) {
			return layout.shape === false ? undefined : layout.shape;
		}
		const typeRoot = layout.typeRoot;
		if (
			this.shapeCount >= this.limits.maxShapes ||
			this.positionCount + layout.positions > this.limits.maxPositions ||
			typeRoot.typeShapes >= this.limits.maxShapesPerType
		) {
			layout.shape = false;
			return undefined;
		}
		const fields: FieldShape[] = [];
		for (
			let current: ContentLayout | undefined = layout;
			current?.field !== undefined;
			current = current.parent
		) {
			fields.push(current.field);
		}
		fields.reverse();
		const shape = new TreeShape(type, false, fields);
		this.shapes.add(shape);
		this.shapeCount++;
		this.positionCount += shape.nodeCount;
		typeRoot.typeShapes++;
		layout.shape = shape;
		return shape;
	}

	/**
	 * Packs a field's key, child shape and length into one number.
	 *
	 * @param assignIds - Whether to assign ids to a key or shape which has none.
	 * @returns The packed number, or `undefined` if the key or shape has no id and can not be assigned one
	 * (because `assignIds` is false or the limits are reached).
	 */
	private transitionKey(
		key: FieldKey,
		childShape: TreeShape,
		length: number,
		assignIds: boolean,
	): number | undefined {
		let keyId = this.fieldKeyIds.get(key);
		if (keyId === undefined) {
			if (!assignIds || this.fieldKeyIds.size >= this.limits.maxFieldKeys) {
				return undefined;
			}
			keyId = this.fieldKeyIds.size;
			this.fieldKeyIds.set(key, keyId);
		}
		let shapeId = this.childShapeIds.get(childShape);
		if (shapeId === undefined) {
			if (!assignIds || this.childShapeIds.size >= maxChildShapeIds) {
				return undefined;
			}
			shapeId = this.childShapeIds.size;
			this.childShapeIds.set(childShape, shapeId);
		}
		return (keyId * maxChildShapeIds + shapeId) * this.fieldLengthRadix + length;
	}

	/**
	 * Whether the field `key` of nodes of type `type` is encoded incrementally.
	 * Types which can not have fields according to the schema are treated as incremental, so they never get a shape.
	 */
	private isIncremental(type: TreeNodeSchemaIdentifier, key: FieldKey): boolean {
		const nodeSchema = this.schema.nodeSchema.get(type);
		if (nodeSchema instanceof ObjectNodeStoredSchema) {
			return this.shouldEncodeIncrementally(type, key);
		}
		if (nodeSchema instanceof MapNodeStoredSchema) {
			return this.shouldEncodeIncrementally(type);
		}
		return true;
	}
}
