/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Delta,
	EmptyKey,
	FieldKey,
	getDescendant,
	IForestSubscription,
	ITreeCursorSynchronous,
	keyAsDetachedField,
	MapTree,
	moveToDetachedField,
	RepairDataStore,
	RevisionTag,
	SparseNode,
	UpPath,
	Value,
} from "../core";
import { unreachableCase } from "../util";
import { mapTreeFromCursor, singleMapTreeCursor } from "./mapTreeCursor";

interface RepairData {
	value?: Map<RevisionTag, Value>;
	node?: Map<RevisionTag, MapTree>;
}
type RepairDataNode = SparseNode<RepairData | undefined>;

const repairDataFactory = (): RepairData => ({});
const undefinedFactory = (): undefined => undefined;

export class ForestRepairDataStore implements RepairDataStore {
	private readonly root: RepairDataNode;

	public constructor(
		private readonly forestProvider: (revision: RevisionTag) => IForestSubscription,
	) {
		this.root = new SparseNode<RepairData | undefined>(EmptyKey, 0, undefined, undefined);
	}

	public capture(change: Delta.Root, revision: RevisionTag): void {
		const forest = this.forestProvider(revision);
		const cursor = forest.allocateCursor();

		const visitFieldMarks = (fields: Delta.FieldMarks, parent: RepairDataNode): void => {
			for (const [key, field] of fields) {
				if (parent !== this.root) {
					cursor.enterField(key);
				} else {
					moveToDetachedField(forest, cursor, keyAsDetachedField(key));
				}
				visitField(field, parent, key);
				if (parent !== this.root) {
					cursor.exitField();
				}
			}
		};

		function visitField(delta: Delta.MarkList, parent: RepairDataNode, key: FieldKey): void {
			let index = 0;
			for (const mark of delta) {
				if (typeof mark === "number") {
					// Untouched nodes
					index += mark;
				} else {
					// Inline into `switch(mark.type)` once we upgrade to TS 4.7
					const type = mark.type;
					switch (type) {
						case Delta.MarkType.ModifyAndMoveOut:
						case Delta.MarkType.ModifyAndDelete: {
							const child = parent.getOrCreateChild(key, index, repairDataFactory);
							visitModify(mark, child);
							onDelete(parent, key, index, 1);
							index += 1;
							break;
						}
						case Delta.MarkType.MoveOut:
						case Delta.MarkType.Delete: {
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
						case Delta.MarkType.InsertAndModify:
						case Delta.MarkType.MoveIn:
						case Delta.MarkType.MoveInAndModify:
							break;
						default:
							unreachableCase(type);
					}
				}
			}
		}

		function visitModify(modify: ModifyLike, node: RepairDataNode): void {
			// Note that the `in` operator return true for properties that are present on the object even if they
			// are set to `undefined. This is leveraged here to represent the fact that the value should be set to
			// `undefined` as opposed to leaving the value untouched.
			if ("setValue" in modify) {
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
				const nodeData = mapTreeFromCursor(fork);
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

		visitFieldMarks(change, this.root);
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
			return singleMapTreeCursor(repair);
		});
	}

	public getValue(revision: RevisionTag, path: UpPath): Value {
		const data = getDescendant(this.root, path).data;
		const valueMap = data?.value;
		assert(valueMap?.has(revision) === true, 0x47e /* No repair data found */);
		return valueMap.get(revision);
	}
}

interface ModifyLike {
	setValue?: Value;
	fields?: Delta.FieldMarks;
}
