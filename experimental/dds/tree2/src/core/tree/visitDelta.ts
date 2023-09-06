/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import { Mutable, brand, extractFromOpaque, makeArray } from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { DetachedPlaceUpPath, DetachedRangeUpPath, NodeIndex, PlaceIndex, Range } from "./pathTree";
import { ForestRootId, TreeIndex } from "./treeIndex";
import { ReplaceKind } from "./visitPath";

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
	const modsToMovedTrees: Map<Delta.MoveId, Delta.FieldMarks> = new Map();
	const insertToRootId: Map<Delta.Insert, ForestRootId> = new Map();
	const creations: Map<Delta.Insert, ForestRootId> = new Map();
	const rootTreesDetachPass: Map<ForestRootId, Delta.FieldMarks> = new Map();
	const rootTransfersDetachPass: Map<ForestRootId, ForestRootId> = new Map();
	const detachConfig: PassConfig = {
		func: detachPass,
		modsToMovedTrees,
		treeIndex,
		insertToRootId,
		creations,
		rootTrees: rootTreesDetachPass,
		rootTransfers: rootTransfersDetachPass,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	// Fixed point iteration until we have no more detached roots to execute the detach pass on.
	while (creations.size > 0 || rootTreesDetachPass.size > 0) {
		for (const [insert, firstRoot] of creations) {
			creations.delete(insert);
			for (let i = 0; i < insert.content.length; i += 1) {
				const root: ForestRootId = brand(firstRoot + i);
				const field = treeIndex.toFieldKey(root);
				visitor.enterField(field);
				visitor.create(0, insert.content.slice(i, i + 1));
				visitor.exitField(field);
			}
		}
		for (const [root, modifications] of rootTreesDetachPass) {
			rootTreesDetachPass.delete(root);
			const field = treeIndex.toFieldKey(root);
			visitor.enterField(field);
			visitModify(0, modifications, visitor, detachConfig);
			visitor.exitField(field);
		}
	}
	const rootTreesAttachPass: Map<ForestRootId, Delta.FieldMarks> = new Map();
	const rootTransfersAttachPass: Map<ForestRootId, ForestRootId> = new Map();
	const attachConfig: PassConfig = {
		func: attachPass,
		modsToMovedTrees,
		treeIndex,
		insertToRootId,
		creations,
		rootTrees: rootTreesAttachPass,
		rootTransfers: rootTransfersAttachPass,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	while (rootTransfersAttachPass.size > 0 || rootTreesAttachPass.size > 0) {
		for (const [source, destination] of rootTransfersAttachPass) {
			rootTransfersAttachPass.delete(source);
			const sourceField = treeIndex.toFieldKey(source);
			const destinationField = treeIndex.toFieldKey(destination);
			visitor.enterField(sourceField);
			visitor.replace(
				undefined,
				{ start: 0, end: 1 },
				brand({ field: destinationField, index: 0 }),
				ReplaceKind.CellPerfect,
			);
			visitor.exitField(sourceField);
		}
		for (const [root, modifications] of rootTreesAttachPass) {
			rootTreesAttachPass.delete(root);
			const field = treeIndex.toFieldKey(root);
			visitor.enterField(field);
			visitModify(0, modifications, visitor, attachConfig);
			visitor.exitField(field);
		}
	}
}

/**
 * Visitor for changes in a delta.
 * Must be freed after use.
 * @alpha
 */
export interface DeltaVisitor {
	free(): void;
	create(index: PlaceIndex, content: Delta.ProtoNodes): void;
	destroy(range: Range): void;

	/**
	 *
	 * @param oldContentIndex
	 * @param oldContentCount
	 * @param oldContentDestination - Undefined when there is no prior content.
	 * @param newContentSource - Undefined when there is no new content.
	 */
	replace(
		newContentSource: DetachedRangeUpPath | undefined,
		oldContent: Range,
		oldContentDestination: DetachedPlaceUpPath | undefined,
		kind: ReplaceKind,
	): void;

	enterNode(index: NodeIndex): void;
	exitNode(index: NodeIndex): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly func: Pass;

	readonly insertToRootId: Map<Delta.Insert, ForestRootId>;
	readonly creations: Map<Delta.Insert, ForestRootId>;
	readonly rootTrees: Map<ForestRootId, Delta.FieldMarks>;
	readonly rootTransfers: Map<ForestRootId, ForestRootId>;
	readonly treeIndex: TreeIndex;
	/**
	 * Stores the nested changes for all moved trees.
	 * Only used for the attach pass in cases where the moved-in tree is transient.
	 * In cases where the moved-in tree is not transient, the nested changes are obtained from the replace.
	 */
	readonly modsToMovedTrees: Map<Delta.MoveId, Delta.FieldMarks>;
}

function ensureCreation(mark: Delta.Insert, config: PassConfig): ForestRootId {
	const existing = config.insertToRootId.get(mark);
	if (existing !== undefined) {
		return existing;
	}
	const { root } = config.treeIndex.createEntry(undefined, mark.content.length);
	config.insertToRootId.set(mark, root);
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
	fields: Delta.FieldMarks | undefined,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	if (fields !== undefined) {
		visitor.enterNode(index);
		visitFieldMarks(fields, visitor, config);
		visitor.exitNode(index);
	}
}

interface Replace {
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

function offsetDetachId(detachId: Delta.DetachedNodeId, offset: number): Delta.DetachedNodeId {
	return {
		...detachId,
		minor: detachId.minor + offset,
	};
}

function asReplaces(
	mark: Exclude<Delta.Mark, number | Delta.Modify<any>>,
	config: PassConfig,
): Replace[] {
	// Inline into `switch(mark.type)` once we upgrade to TS 4.7
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Remove: {
			return makeArray(mark.count, (i) => {
				const { root } = config.treeIndex.getOrCreateEntry(
					offsetDetachId(mark.detachId, i),
				);
				return {
					oldContent: { fields: mark.fields, destination: root },
				};
			});
		}
		case Delta.MarkType.MoveOut: {
			if (mark.detachedNodeId === undefined) {
				const minor = extractFromOpaque(mark.moveId);
				return makeArray(mark.count, (i) => {
					const detachId = {
						major: "move",
						minor: minor + i,
					};
					const { root } = config.treeIndex.getOrCreateEntry(detachId);
					return {
						oldContent: { fields: mark.fields, destination: root },
					};
				});
			}
			return [];
		}
		case Delta.MarkType.MoveIn: {
			if (mark.detachId === undefined) {
				const minor = extractFromOpaque(mark.moveId);
				const fields = config.modsToMovedTrees.get(mark.moveId);
				return makeArray(mark.count, (i) => {
					const detachId = {
						major: "move",
						minor: minor + i,
					};
					const { root } = config.treeIndex.getOrCreateEntry(detachId);
					return { newContent: { source: root, fields } };
				});
			} else {
				return [];
			}
		}
		case Delta.MarkType.Insert: {
			if (mark.detachId === undefined || mark.oldContent !== undefined) {
				const newContentSource = ensureCreation(mark, config);
				return makeArray(mark.content.length, (i) => {
					const replace: Mutable<Replace> = {};
					if (mark.detachId === undefined) {
						replace.newContent = {
							fields: mark.fields,
							source: brand(newContentSource + i),
						};
					}
					if (mark.oldContent !== undefined) {
						// Content is being replaced
						const { root: oldContentDestination } = config.treeIndex.getOrCreateEntry(
							offsetDetachId(mark.oldContent.detachId, i),
						);
						replace.oldContent = {
							fields: mark.oldContent.fields,
							destination: oldContentDestination,
						};
					}
					return replace;
				});
			}
			return [];
		}
		case Delta.MarkType.Restore: {
			if (mark.newContent.detachId === undefined || mark.oldContent !== undefined) {
				return makeArray(mark.count, (i) => {
					const replace: Mutable<Replace> = {};
					if (mark.newContent.detachId === undefined) {
						const { root: restoredRoot } = config.treeIndex.getOrCreateEntry(
							offsetDetachId(mark.newContent.restoreId, i),
						);
						const newContent = { source: restoredRoot, fields: mark.fields };
						replace.newContent = newContent;
					}
					if (mark.oldContent !== undefined) {
						const { root } = config.treeIndex.getOrCreateEntry(
							offsetDetachId(mark.oldContent.detachId, i),
						);
						replace.oldContent = { destination: root, fields: mark.oldContent.fields };
					}
					return replace;
				});
			}
			return [];
		}
		default:
			unreachableCase(type);
	}
}

function catalogDetachPassRootChanges(mark: Exclude<Delta.Mark, number>, config: PassConfig): void {
	let nodeId: Delta.DetachedNodeId | undefined;
	let fields: Delta.FieldMarks | undefined;
	switch (mark.type) {
		case Delta.MarkType.Insert: {
			const root = ensureCreation(mark, config);
			if (mark.fields !== undefined) {
				config.rootTrees.set(root, mark.fields);
			}
			break;
		}
		case Delta.MarkType.Modify:
		case Delta.MarkType.MoveOut:
			nodeId = mark.detachedNodeId;
			fields = mark.fields;
			break;
		case Delta.MarkType.Restore: {
			nodeId = mark.newContent.restoreId;
			fields = mark.fields;
			break;
		}
		default:
			break;
	}
	if (nodeId !== undefined && fields !== undefined) {
		const { root } = config.treeIndex.getOrCreateEntry(nodeId);
		config.rootTrees.set(root, fields);
	}
}

function catalogAttachPassRootChanges(mark: Exclude<Delta.Mark, number>, config: PassConfig): void {
	let nodeId: Delta.DetachedNodeId | undefined;
	let fields: Delta.FieldMarks | undefined;
	switch (mark.type) {
		case Delta.MarkType.Insert: {
			const rootSource = ensureCreation(mark, config);
			nodeId = mark.detachId;
			fields = mark.fields;
			if (mark.detachId !== undefined) {
				const count = mark.content.length;
				const { root: rootDestination } = config.treeIndex.getOrCreateEntry(
					mark.detachId,
					count,
				);
				setRootReplaces(count, config, rootDestination, rootSource);
			}
			break;
		}
		case Delta.MarkType.Modify:
			nodeId = mark.detachedNodeId;
			fields = mark.fields;
			break;
		case Delta.MarkType.MoveIn: {
			nodeId = mark.detachId;
			fields = config.modsToMovedTrees.get(mark.moveId);
			// Handles moves whose content is being removed after the move
			if (mark.detachId !== undefined) {
				const minor = extractFromOpaque(mark.moveId);
				const sourceNodeId = { major: "move", minor };
				const { root: rootSource } = config.treeIndex.getOrCreateEntry(sourceNodeId);
				const { root: rootDestination } = config.treeIndex.getOrCreateEntry(mark.detachId);
				setRootReplaces(mark.count, config, rootDestination, rootSource);
			}
			break;
		}
		case Delta.MarkType.Restore: {
			nodeId = mark.newContent.restoreId;
			fields = mark.fields;
			if (mark.newContent.detachId !== undefined) {
				const { root: rootSource } = config.treeIndex.getOrCreateEntry(
					mark.newContent.restoreId,
				);
				const { root: rootDestination } = config.treeIndex.getOrCreateEntry(
					mark.newContent.detachId,
				);
				setRootReplaces(mark.count, config, rootDestination, rootSource);
			}
			break;
		}
		default:
			break;
	}
	if (nodeId !== undefined && fields !== undefined) {
		const { root } = config.treeIndex.getOrCreateEntry(nodeId);
		config.rootTrees.set(root, fields);
	}
}

function setRootReplaces(
	count: number,
	config: PassConfig,
	destination: ForestRootId,
	source: ForestRootId,
) {
	for (let i = 0; i < count; i += 1) {
		config.rootTransfers.set(brand(source + i), brand(destination + i));
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
			catalogDetachPassRootChanges(mark, config);
			if (mark.type === Delta.MarkType.Modify) {
				if (mark.detachedNodeId === undefined) {
					visitModify(index, mark.fields, visitor, config);
					index += 1;
				}
			} else {
				if (mark.type === Delta.MarkType.MoveOut && mark.fields !== undefined) {
					config.modsToMovedTrees.set(mark.moveId, mark.fields);
				}
				const replaces = asReplaces(mark, config);
				for (const { oldContent, newContent } of replaces) {
					if (oldContent !== undefined) {
						visitModify(index, oldContent.fields, visitor, config);
						if (newContent === undefined) {
							// This a simple detach
							const oldRoot = oldContent.destination;
							const field = config.treeIndex.toFieldKey(brand(oldRoot));
							visitor.replace(
								undefined,
								{ start: index, end: index + 1 },
								brand({ field, index: 0 }),
								ReplaceKind.CellPerfect,
							);
						} else {
							// This really is a replace.
							// Delay the detach until we can do it during the attach pass.
							index += 1;
						}
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
			catalogAttachPassRootChanges(mark, config);
			if (mark.type === Delta.MarkType.Modify) {
				if (mark.detachedNodeId === undefined) {
					visitModify(index, mark.fields, visitor, config);
					index += 1;
				}
			} else {
				const replaces = asReplaces(mark, config);
				for (const { oldContent, newContent } of replaces) {
					if (newContent !== undefined) {
						const newRoot = newContent.source;
						const newContentField = config.treeIndex.toFieldKey(newRoot);
						if (oldContent !== undefined) {
							// This is a true replace.
							const oldRoot = oldContent.destination;
							const oldContentField = config.treeIndex.toFieldKey(oldRoot);
							visitor.replace(
								brand({ field: newContentField, start: 0, end: 1 }),
								{ start: index, end: index + 1 },
								brand({ field: oldContentField, index: 0 }),
								ReplaceKind.CellPerfect,
							);
						} else {
							// This a simple attach
							visitor.replace(
								brand({ field: newContentField, start: 0, end: 1 }),
								{ start: index, end: index },
								undefined,
								ReplaceKind.CellPerfect,
							);
						}
						visitModify(index, newContent.fields, visitor, config);
						index += 1;
					}
				}
			}
		}
	}
}
