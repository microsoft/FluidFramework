/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	AnchorSet,
	castCursorToSynchronous,
	Delta,
	EmptyKey,
	FieldKey,
	getDescendant,
	IEditableForest,
	IForestSubscription,
	InMemoryStoredSchemaRepository,
	IRepairDataStoreProvider,
	ITreeCursorSynchronous,
	keyAsDetachedField,
	moveToDetachedField,
	RepairDataStore,
	RevisionTag,
	SparseNode,
	UpPath,
	Value,
} from "../core";
import { chunkTree, TreeChunk, defaultChunkPolicy } from "./chunked-forest";

interface RepairData {
	value?: Map<RevisionTag, Value>;
	node?: Map<RevisionTag, TreeChunk>;
}
type RepairDataNode = SparseNode<RepairData | undefined>;

const repairDataFactory = (): RepairData => ({});
const undefinedFactory = (): undefined => undefined;

export class ForestRepairDataStore<TChange> implements RepairDataStore<TChange> {
	private readonly root: RepairDataNode;

	public constructor(
		private readonly forest: IForestSubscription,
		private readonly intoDelta: (change: TChange) => Delta.Root,
	) {
		this.root = new SparseNode<RepairData | undefined>(EmptyKey, 0, undefined, undefined);
	}

	public capture(change: TChange, revision: RevisionTag): void {
		/**
		 * Cursor used to traverse the forest and build fetch the repair data.
		 * Note that the cursor is implicitly captured by the functions below, which have requirements for the cursor.
		 * Calling those functions requires that the cursor be in the appropriate state.
		 */
		const cursor = this.forest.allocateCursor();
		const delta = this.intoDelta(change);

		/**
		 * Visits the node `cursor` is positioned at.
		 * Restores the `cursor` to that same position before exiting.
		 */
		const visitFieldMarks = (fields: Delta.FieldMarks, parent: RepairDataNode): void => {
			for (const [key, field] of fields) {
				if (parent !== this.root) {
					cursor.enterField(key);
				} else {
					moveToDetachedField(this.forest, cursor, keyAsDetachedField(key));
				}
				visitField(field, parent, key);
				if (parent !== this.root) {
					cursor.exitField();
				}
			}
		};

		/**
		 * Visits the field `cursor` is positioned at.
		 * Restores the `cursor` to that same position before exiting.
		 */
		function visitField(field: Delta.MarkList, parent: RepairDataNode, key: FieldKey): void {
			let index = 0;
			for (const mark of field) {
				if (typeof mark === "number") {
					// Untouched nodes
					index += mark;
				} else {
					// Inline into `switch(mark.type)` once we upgrade to TS 4.7
					const type = mark.type;
					switch (type) {
						case Delta.MarkType.MoveOut:
						case Delta.MarkType.Delete: {
							cursor.enterNode(index);
							const child = parent.getOrCreateChild(key, index, repairDataFactory);
							visitModify(mark, child);
							cursor.exitNode();
							onDelete(parent, key, index, mark.count);
							index += mark.count;
							break;
						}
						case Delta.MarkType.Modify: {
							cursor.enterNode(index);
							const child = parent.getOrCreateChild(key, index, undefinedFactory);
							visitModify(mark, child);
							cursor.exitNode();
							index += 1;
							break;
						}
						case Delta.MarkType.Insert:
						case Delta.MarkType.MoveIn:
							break;
						default:
							unreachableCase(type);
					}
				}
			}
		}

		/**
		 * Requires that `cursor` be positioned on a node.
		 * Restores the `cursor` to that same position before exiting.
		 */
		function visitModify(modify: Delta.HasModifications, node: RepairDataNode): void {
			// Note that the check below returns true for properties that are present on the object even if they
			// are set to `undefined`. This is leveraged here to represent the fact that the value should be set to
			// `undefined` as opposed to leaving the value unchanged.
			if (Object.prototype.hasOwnProperty.call(modify, "setValue")) {
				if (node.data === undefined) {
					node.data = repairDataFactory();
				}
				const value = cursor.value;
				if (node.data.value === undefined) {
					node.data.value = new Map();
				}
				node.data.value.set(revision, value);
			}
			if (modify.fields !== undefined) {
				visitFieldMarks(modify.fields, node);
			}
		}

		/**
		 * Requires that `cursor` be positioned in the field where the deletion takes place.
		 * Does not move `cursor`.
		 */
		function onDelete(
			parent: RepairDataNode,
			key: FieldKey,
			startIndex: number,
			count: number,
		): void {
			for (let i = 0; i < count; ++i) {
				const fork = cursor.fork();
				const index = startIndex + i;
				fork.enterNode(index);
				const nodeData = chunkTree(castCursorToSynchronous(fork), defaultChunkPolicy);
				fork.free();
				const child = parent.getOrCreateChild(key, index, repairDataFactory);
				if (child.data === undefined) {
					child.data = repairDataFactory();
				}
				if (child.data.node === undefined) {
					child.data.node = new Map();
				}
				child.data.node.set(revision, nodeData);
			}
		}

		visitFieldMarks(delta, this.root);
		cursor.free();
	}

	public getNodes(
		revision: RevisionTag,
		path: UpPath | undefined,
		field: FieldKey,
		index: number,
		count: number,
	): ITreeCursorSynchronous[] {
		const parent = getDescendant(this.root, path);
		const sparseField = parent.children.get(field);
		assert(sparseField !== undefined, 0x47a /* No repair data found */);
		// TODO: should do more optimized search (ex: binary search).
		const sparseIndex = sparseField.findIndex((child) => child.parentIndex === index);
		assert(sparseIndex !== -1, 0x47b /* No repair data found */);
		assert(
			sparseField[sparseIndex + count - 1]?.parentIndex === index + count - 1,
			0x47c /* No repair data found */,
		);
		return sparseField.slice(sparseIndex, sparseIndex + count).map((node) => {
			const repair = node.data?.node?.get(revision);
			assert(repair !== undefined, 0x47d /* No repair data found */);
			const cursor = repair.cursor();
			// TODO: leverage TreeChunk's ability to represent a range of contiguous nodes
			assert(
				cursor.getFieldLength() === 1,
				0x55b /* only one node should have been chunked */,
			);
			cursor.firstNode();
			return cursor;
		});
	}

	public getValue(revision: RevisionTag, path: UpPath): Value {
		const data = getDescendant(this.root, path).data;
		const valueMap = data?.value;
		assert(valueMap?.has(revision) === true, 0x47e /* No repair data found */);
		return valueMap.get(revision);
	}
}

export class ForestRepairDataStoreProvider<TChange> implements IRepairDataStoreProvider<TChange> {
	private frozenForest: IForestSubscription | undefined;

	public constructor(
		private readonly forest: IEditableForest,
		private readonly storedSchema: InMemoryStoredSchemaRepository,
		private readonly intoDelta: (change: TChange) => Delta.Root,
	) {}

	public freeze(): void {
		this.frozenForest = this.forest.clone(this.storedSchema.clone(), new AnchorSet());
	}

	public applyChange(change: TChange): void {
		if (this.frozenForest === undefined) {
			this.forest.applyDelta(this.intoDelta(change));
		}
	}

	public createRepairData(): ForestRepairDataStore<TChange> {
		const repairDataStore =
			this.frozenForest !== undefined
				? new ForestRepairDataStore(this.frozenForest, this.intoDelta)
				: new ForestRepairDataStore(this.forest, this.intoDelta);
		this.frozenForest = undefined;
		return repairDataStore;
	}

	public clone(forest?: IEditableForest): ForestRepairDataStoreProvider<TChange> {
		const storedSchema = this.storedSchema.clone();
		return new ForestRepairDataStoreProvider(
			forest ?? this.forest.clone(storedSchema, new AnchorSet()),
			storedSchema,
			this.intoDelta,
		);
	}
}
