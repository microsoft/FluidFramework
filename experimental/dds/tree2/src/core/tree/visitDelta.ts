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
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that deletes the first and third node of a field, the visitor calls
 * will pass indices 0 and 1 respectively.
 *
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(delta: Delta.Root, visitor: DeltaVisitor, treeIndex: TreeIndex): void {
	const modsToMovedTrees: Map<Delta.MoveId, Delta.FieldMarks> = new Map();
	const insertToRootId: Map<Delta.Insert, ForestRootId> = new Map();
	const creations: Map<Delta.Insert, ForestRootId> = new Map();
	const rootTreesDetachPass: Map<ForestRootId, Delta.FieldMarks> = new Map();
	const rootTransfers: RootTransfers = new Map();
	const detachConfig: PassConfig = {
		func: detachPass,
		modsToMovedTrees,
		treeIndex,
		insertToRootId,
		creations,
		rootTrees: rootTreesDetachPass,
		rootTransfers,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	// Fixed point iteration until we have no more detached roots to execute the detach pass on.
	while (creations.size > 0 || rootTreesDetachPass.size > 0 || rootTransfers.size > 0) {
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
		transferRoots(rootTransfers, treeIndex, visitor);
	}
	const rootTreesAttachPass: Map<ForestRootId, Delta.FieldMarks> = new Map();
	const attachConfig: PassConfig = {
		func: attachPass,
		modsToMovedTrees,
		treeIndex,
		insertToRootId,
		creations,
		rootTrees: rootTreesAttachPass,
		rootTransfers,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	while (rootTransfers.size > 0 || rootTreesAttachPass.size > 0) {
		transferRoots(rootTransfers, treeIndex, visitor);
		for (const [root, modifications] of rootTreesAttachPass) {
			rootTreesAttachPass.delete(root);
			const field = treeIndex.toFieldKey(root);
			visitor.enterField(field);
			visitModify(0, modifications, visitor, attachConfig);
			visitor.exitField(field);
		}
	}
}

type RootTransfers = Map<
	ForestRootId,
	{
		nodeId?: Delta.DetachedNodeId;
		destination: ForestRootId;
	}
>;

function transferRoots(rootTransfers: RootTransfers, treeIndex: TreeIndex, visitor: DeltaVisitor) {
	for (const [source, { nodeId, destination }] of rootTransfers) {
		rootTransfers.delete(source);
		const sourceField = treeIndex.toFieldKey(source);
		const destinationField = treeIndex.toFieldKey(destination);
		visitor.enterField(sourceField);
		visitor.detach({ start: 0, end: 1 }, brand({ field: destinationField, index: 0 }));
		visitor.exitField(sourceField);
		if (nodeId !== undefined) {
			treeIndex.deleteEntry(nodeId);
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
	destroy(range: DetachedRangeUpPath): void;

	attach(source: DetachedRangeUpPath, destination: PlaceIndex): void;
	detach(source: Range, destination: DetachedPlaceUpPath): void;

	replace(
		newContentSource: DetachedRangeUpPath,
		oldContent: Range,
		oldContentDestination: DetachedPlaceUpPath,
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
	readonly rootTransfers: RootTransfers;
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
		 * The ID to assign to the node being replaced.
		 */
		readonly destination: ForestRootId;
		/**
		 * Modifications to the replaced content.
		 */
		readonly fields?: Delta.FieldMarks;
	};

	/**
	 * When set, indicates that some new content is being attached.
	 */
	readonly newContent?: {
		/**
		 * The ID of the node being attached.
		 */
		readonly source: ForestRootId;
		/**
		 * The node ID entry associated with the content.
		 * Undefined for created content.
		 */
		readonly nodeId?: Delta.DetachedNodeId;
		/**
		 * Modifications to the new content.
		 */
		readonly fields?: Delta.FieldMarks;
	};
}

function offsetDetachId(detachId: Delta.DetachedNodeId, offset: number): Delta.DetachedNodeId;
function offsetDetachId(
	detachId: Delta.DetachedNodeId | undefined,
	offset: number,
): Delta.DetachedNodeId | undefined;
function offsetDetachId(
	detachId: Delta.DetachedNodeId | undefined,
	offset: number,
): Delta.DetachedNodeId | undefined {
	if (detachId === undefined) {
		return undefined;
	}
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
					const nodeId = {
						major: "move",
						minor: minor + i,
					};
					const { root } = config.treeIndex.getOrCreateEntry(nodeId);
					return { newContent: { source: root, nodeId, fields } };
				});
			} else {
				return [];
			}
		}
		case Delta.MarkType.Insert: {
			if (
				(mark.content.length > 0 && mark.detachId === undefined) ||
				mark.oldContent !== undefined
			) {
				const newContentSource = ensureCreation(mark, config);
				return makeArray(mark.content.length, (i) => {
					const replace: Mutable<Replace> = {};
					if (mark.detachId === undefined) {
						replace.newContent = {
							source: brand(newContentSource + i),
							fields: mark.fields,
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
						const nodeId = offsetDetachId(mark.newContent.restoreId, i);
						const { root: restoredRoot } = config.treeIndex.getOrCreateEntry(nodeId);
						const newContent = { source: restoredRoot, nodeId, fields: mark.fields };
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
			if (mark.content.length > 0) {
				const root = ensureCreation(mark, config);
				if (mark.fields !== undefined) {
					config.rootTrees.set(root, mark.fields);
				}
			}
			break;
		}
		case Delta.MarkType.Modify:
			nodeId = mark.detachedNodeId;
			fields = mark.fields;
			break;
		case Delta.MarkType.MoveOut:
			nodeId = mark.detachedNodeId;
			fields = mark.fields;
			if (nodeId !== undefined) {
				const minor = extractFromOpaque(mark.moveId);
				const destinationNodeId = { major: "move", minor };
				const { root: rootSource } = config.treeIndex.getEntry(nodeId);
				const { root: rootDestination } =
					config.treeIndex.getOrCreateEntry(destinationNodeId);
				setRootReplaces(mark.count, config, rootDestination, rootSource, nodeId);
			}
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
			if (mark.content.length > 0) {
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
				setRootReplaces(mark.count, config, rootDestination, rootSource, sourceNodeId);
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
				setRootReplaces(mark.count, config, rootDestination, rootSource, nodeId);
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
	sourceNodeId?: Delta.DetachedNodeId,
) {
	// It's possible for a detached node to be transiently revived such that it ends up back in the same detached field
	// Making such a transfer wouldn't just be inefficient, it would lead to to mistakenly think we have moved all content
	// out of the source field, and would lead us to delete the tree index entry for that source field.
	if (source !== destination) {
		for (let i = 0; i < count; i += 1) {
			config.rootTransfers.set(brand(source + i), {
				destination: brand(destination + i),
				nodeId: offsetDetachId(sourceNodeId, i),
			});
		}
	}
}

/**
 * Preforms the following:
 * - Collects all root creations
 * - Collects all roots that need a first pass
 * - Executes detaches (bottom-up) provided they are not part of a replace
 * (because we want to wait until we are sure content to attach is available as a root)
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
							visitor.detach(
								{ start: index, end: index + 1 },
								brand({ field, index: 0 }),
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
							visitor.attach(
								brand({ field: newContentField, start: 0, end: 1 }),
								index,
							);
						}
						if (newContent.nodeId !== undefined) {
							config.treeIndex.deleteEntry(newContent.nodeId);
						}
						visitModify(index, newContent.fields, visitor, config);
						index += 1;
					}
				}
			}
		}
	}
}
