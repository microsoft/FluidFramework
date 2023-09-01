/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	Mutable,
	RangeMap,
	brand,
	extractFromOpaque,
	getFirstFromRangeMap,
	setInRangeMap,
} from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { DetachedPlaceUpPath, DetachedRangeUpPath, NodeIndex, PlaceIndex } from "./pathTree";
import { ForestRootId, TreeIndex } from "./treeIndex";

/**
 * Implementation notes:
 *
 * Because visitors are based on describing changes at some location in the tree (with the exception of "build"),
 * we want to ensure that visitors visit changes in an order that guarantees all changes are describable in terms
 * of some position in the tree. This means that we need to detach content bottom-up and attach content top-down.
 * Note that while the attach positions are expressed top-down, there is still a bottom-up spirit to building trees
 * that are being inserted.
 *
 * The second challenge, is that of the inability of the visitor to move-in content that has yet to be moved-out.
 * This leads to a two-pass algorithm, but there are two degrees for freedom to consider:
 *
 * 1. Whether inserts should be performed in the first pass whenever possible (some are not: inserts below a move-ins
 * for which we have not yet seen the matching move-out).
 * Pros: The path above the insertion point is walked once instead of twice
 * Cons: The paths within the inserted content risk being walked twice instead of once (once for building the content,
 * once for traversing the tree to reach move-in marks in the second phase).
 *
 * 2. Whether move-ins for which we have the move-out content should be performed in the first pass.
 * Pros: The path above the move-in point is walked once instead of twice
 * Cons: We now have to record which of the move-ins we did not perform in the first pass. We could build a trie of
 * those to reduce the amount of sifting we have to do on the second pass.
 *
 * The presence of a move table, which lists the src and dst paths for each move, could be leveraged to make some of
 * these option more efficient:
 *
 * - If inserts are allowed in the first pass and move-ins are not allowed in the first pass, then the move table
 * describes exactly which parts of the delta need applying in the second pass.
 *
 * - If inserts and move-ins are allowed in the first pass then having a boolean flag for each entry in the move table
 * that describes whether the move has been attached, or having a set for that describes which entries remain, would
 * describe which parts of the delta  need applying in the second pass.
 *
 * Current implementation:
 *
 * - First pass: performs inserts top-down and move-outs bottom-up (it also performs value updates)
 *
 * - Second pass: performs move-ins top-down and deletes bottom-up
 *
 * - Skips the second pass if no moves or deletes were encountered in the first pass
 *
 * Future work:
 *
 * - Allow the visitor to ignore changes to regions of the tree that are not of interest to it (for partial views).
 *
 * - Avoid moving the visitor through parts of the document that do not need changing in the current pass.
 * This could be done by assigning IDs to nodes of interest and asking the visitor to jump to these nodes in order to edit them.
 *
 * - Leverage the move table if one ever gets added to Delta
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that deletes the first and third node of a field, the visitor calls
 * will pass indices 0 and 1 respectively.
 *
 * Note a node may be moved more than once while visiting a delta.
 * This is because the delta may move-out a single block of adjacent nodes which are not all moved to the same destination.
 * To avoid the need for the visitor to support moving-in a subrange of a moved-out block, this function will instead
 * move-in the entire block and then move-out the unused portions with new move IDs.
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(delta: Delta.Root, visitor: DeltaVisitor, treeIndex: TreeIndex): void {
	const creations: Map<Delta.Insert, ForestRootId> = new Map();
	const rootTrees: Map<ForestRootId, Delta.HasModifications> = new Map();
	const detachConfig = {
		func: detachPass,
		treeIndex,
		creations,
		rootTrees,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	let priorBatch = detachConfig;
	// Fixed point iteration until we have no more new detached roots to execute the detach pass on.
	while (priorBatch.creations.size > 0 || priorBatch.rootTrees.size > 0) {
		const newBatch: PassConfig = {
			func: detachPass,
			treeIndex,
			creations: new Map(),
			rootTrees: new Map(),
		};
		for (const [insert, firstRoot] of priorBatch.creations) {
			for (let i = 0; i < insert.content.length; i += 1) {
				const root: ForestRootId = brand(firstRoot + i);
				const field = treeIndex.toFieldKey(root);
				visitor.create(brand({ field, index: 0 }), insert.content.slice(i, i + 1));
			}
			if (insert.fields !== undefined) {
				priorBatch.rootTrees.set(firstRoot, insert);
			}
		}
		for (const [root, modifications] of priorBatch.rootTrees) {
			const field = treeIndex.toFieldKey(root);
			visitor.enterField(field);
			visitModify(0, modifications, visitor, newBatch);
			visitor.exitField(field);
		}
		for (const [root, modifications] of newBatch.rootTrees) {
			rootTrees.set(root, modifications);
		}
		priorBatch = newBatch;
	}
	const attachConfig = {
		func: attachPass,
		treeIndex,
		creations,
		rootTrees,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	for (const [root, modifications] of rootTrees) {
		const field = treeIndex.toFieldKey(root);
		visitor.enterField(field);
		visitModify(0, modifications, visitor, attachConfig);
		visitor.exitField(field);
	}
}

export interface DeltaVisitor {
	create(index: DetachedPlaceUpPath, content: Delta.ProtoNodes): void;
	destroy(index: DetachedRangeUpPath): void;

	/**
	 *
	 * @param oldContentIndex
	 * @param oldContentCount
	 * @param oldContentDestination - Undefined when there is no prior content.
	 * @param newContentSource - Undefined when there is no new content.
	 */
	replace(
		newContentSource: DetachedRangeUpPath | undefined,
		oldContentIndex: PlaceIndex,
		oldContentCount: number,
		oldContentDestination: DetachedPlaceUpPath | undefined,
	): void;

	enterNode(index: NodeIndex): void;
	exitNode(index: NodeIndex): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly func: Pass;

	readonly creations: Map<Delta.Insert, ForestRootId>;
	readonly rootTrees: Map<ForestRootId, Delta.HasModifications>;
	readonly treeIndex: TreeIndex;
}

function getOrCreateCreationId(mark: Delta.Insert, config: PassConfig): ForestRootId {
	const existing = config.creations.get(mark);
	if (existing !== undefined) {
		return existing;
	}
	const { root } = config.treeIndex.createEntry(undefined, mark.content.length);
	config.creations.set(mark, root);
	return root;
}

type Pass = (delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig) => void;

function visitFieldMarks(
	fields: Delta.FieldMarks,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	for (const [key, field] of fields) {
		visitor.enterField(key);
		config.func(field, visitor, config);
		visitor.exitField(key);
	}
}

function visitModify(
	index: number,
	modify: Delta.HasModifications,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	if (modify.fields !== undefined) {
		visitor.enterNode(index);
		if (modify.fields !== undefined) {
			visitFieldMarks(modify.fields, visitor, config);
		}
		visitor.exitNode(index);
	}
}

interface Replace {
	readonly count: number;
	/**
	 * When set, indicates that some pre-existing content is being detached.
	 */
	readonly oldContent?: {
		/**
		 * The ID to assign the first node being replaced.
		 * Subsequent replaced nodes should be assigned incrementing IDs.
		 */
		readonly destination: ForestRootId;
		/**
		 * Modifications to the old content.
		 */
		readonly fields?: Delta.FieldMarks;
	};

	/**
	 * When set, indicates that some new content is being attached.
	 */
	readonly newContent?: {
		readonly source: ForestRootId;
		/**
		 * Modifications to the new content.
		 */
		readonly fields?: Delta.FieldMarks;
	};
}

function asReplace(
	mark: Exclude<Delta.Mark, number | Delta.Modify<any>>,
	config: PassConfig,
): Replace {
	// Inline into `switch(mark.type)` once we upgrade to TS 4.7
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Remove: {
			const { root } = config.treeIndex.getOrCreateEntry(mark.id);
			return {
				count: mark.count,
				oldContent: { fields: mark.fields, destination: root },
			};
		}
		case Delta.MarkType.MoveOut: {
			const replace: Mutable<Replace> = { count: mark.count };
			if (mark.detachedNodeId !== undefined) {
				// This is a combination of a revive and a move-out
				// The content being revived is already a detached root.
			} else {
				const minor = extractFromOpaque(mark.moveId);
				const { root } = config.treeIndex.getOrCreateEntry({ minor });
				// TODO: avoid atomizing moves
				for (let i = 1; i < mark.count; i += 1) {
					config.treeIndex.getOrCreateEntry({ major: "move", minor: minor + 1 });
				}
				replace.oldContent = { fields: mark.fields, destination: root };
			}
			return replace;
		}
		case Delta.MarkType.Insert: {
			const newContentSource = getOrCreateCreationId(mark, config);
			const replace: Mutable<Replace> = {
				count: mark.content.length,
				newContent: { fields: mark.fields, source: newContentSource },
			};
			if (mark.oldContent !== undefined) {
				// Content is being replaced
				const { root: oldContentDestination } = config.treeIndex.getOrCreateEntry(
					mark.oldContent.detachId,
				);
				replace.oldContent = {
					fields: mark.oldContent.fields,
					destination: oldContentDestination,
				};
			}
			return replace;
		}
		case Delta.MarkType.MoveIn: {
			const minor = extractFromOpaque(mark.moveId);
			const { root } = config.treeIndex.getOrCreateEntry({ major: "move", minor });
			return { count: mark.count, newContent: { source: root } };
		}
		case Delta.MarkType.Restore: {
			const { root: restoredRoot } = config.treeIndex.getOrCreateEntry(
				mark.newContent.restoreId,
			);
			const replace: Mutable<Replace> = {
				count: mark.count,
				newContent: { source: restoredRoot },
			};
			if (mark.oldContent !== undefined) {
				const { root } = config.treeIndex.getOrCreateEntry(mark.oldContent.detachId);
				replace.oldContent = { destination: root };
			}
			return replace;
		}
		// case Delta.MarkType.Destroy: {
		// 	// TODO: Implement
		// 	assert(false, "MarkType.Destroy not supported yet");
		// }
		default:
			unreachableCase(type);
	}
}

/**
 * Preforms the following:
 * - Collects all root creations
 * - Collects all roots that need a first pass
 * - Executes detaches (bottom-up) provided they are not part of a replace
 *   (because we want to wait until we are sure content to attach is available as a root)
 */
function detachPass(delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig): void {
	let index = 0;
	for (const mark of delta) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
		} else {
			if (mark.type === Delta.MarkType.Modify || mark.type === Delta.MarkType.MoveOut) {
				if (mark.detachedNodeId !== undefined && mark.fields !== undefined) {
					const { root } = config.treeIndex.getEntry(mark.detachedNodeId);
					config.rootTrees.set(root, mark);
				}
			}
			if (mark.type === Delta.MarkType.Modify) {
				if (mark.detachedNodeId === undefined) {
					visitModify(index, mark, visitor, config);
					index += 1;
				}
			} else {
				const { oldContent, newContent, count } = asReplace(mark, config);
				if (oldContent !== undefined) {
					visitModify(index, oldContent, visitor, config);
					if (newContent !== undefined) {
						// This a simple detach
						const oldRoot = oldContent.destination;
						for (let i = 0; i < count; i += 1) {
							const field = config.treeIndex.toFieldKey(brand(oldRoot + i));
							visitor.replace(undefined, index, 1, brand({ field, index: 0 }));
						}
					} else {
						// Don't detach if this really is a replace so we can do it in one operation during the attach pass
						index += count;
					}
				}
			}
		}
	}
}

function attachPass(delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig): void {
	let index = 0;
	for (const mark of delta) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
		} else {
			if (mark.type === Delta.MarkType.Modify) {
				if (mark.detachedNodeId === undefined) {
					visitModify(index, mark, visitor, config);
					index += 1;
				}
			} else {
				const { oldContent, newContent, count } = asReplace(mark, config);
				if (newContent !== undefined) {
					if (oldContent !== undefined) {
						// This is a true replace.
						const newRoot = newContent.source;
						const oldRoot = oldContent.destination;
						for (let i = 0; i < count; i += 1) {
							const newContentField = config.treeIndex.toFieldKey(brand(newRoot + i));
							const oldContentField = config.treeIndex.toFieldKey(brand(oldRoot + i));
							visitor.replace(
								brand({ field: newContentField, start: 0, end: 1 }),
								index + i,
								1,
								brand({ field: oldContentField, index: 0 }),
							);
						}
					} else {
						// This a simple attach
						const newRoot = newContent.source;
						for (let i = 0; i < count; i += 1) {
							const newContentField = config.treeIndex.toFieldKey(brand(newRoot + i));
							visitor.replace(
								brand({ field: newContentField, start: 0, end: 1 }),
								index + i,
								1,
								undefined,
							);
						}
					}
					visitModify(index, newContent, visitor, config);
					index += count;
				}
			}
		}
	}
}
