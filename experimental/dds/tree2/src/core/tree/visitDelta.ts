/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { Mutable, brand, extractFromOpaque, makeArray } from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { NodeIndex, PlaceIndex, Range } from "./pathTree";
import { ForestRootId, DetachedFieldIndex } from "./detachedFieldIndex";

/**
 * Implementation notes:
 *
 * The visit is organized in two passes: a detach pass and an attach pass.
 * The core idea is that before content can be attached, it must first exist and be in a detached field.
 * The detach pass is therefore responsible for making sure that all roots that needs to be attached during the
 * attach pass are ready to be attached.
 * In practice, this means the detach pass must:
 * - Create all subtrees that need to be created
 * - Detach all moved nodes
 *
 * In addition to that, the detach pass also detaches nodes that need removing, with the exception of nodes that get
 * replaced. The reason for this exception is that we need to be able to communicate replaces as atomic operations.
 * In order to do that, we need to wait until we are sure that the content to attach is available as a detached root.
 * Replaces are therefore handled during the attach pass.
 * Note that this could theoretically lead to a situation where, in the attach pass, one replace wants to attach
 * a node that has yet to be detached by another replace. This does not occur in practice because we do not support
 * editing operations that would lead to this situation.
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that removes the first and third node of a field, the visitor calls
 * will first call detach with a range from indices 0 to 1 then call detach with a range from indices 1 to 2.
 *
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(
	delta: Delta.Root,
	visitor: DeltaVisitor,
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const modsToMovedTrees: Map<Delta.MoveId, Delta.FieldMarks> = new Map();
	const insertToRootId: Map<Delta.Insert, ForestRootId> = new Map();
	const creations: Set<Delta.Insert> = new Set();
	const rootChanges: Map<ForestRootId, Delta.FieldMarks> = new Map();
	const rootTransfers: RootTransfers = new Map();
	const detachConfig: PassConfig = {
		name: "detach",
		func: detachPass,
		modsToMovedTrees,
		detachedFieldIndex,
		insertToRootId,
		creations,
		rootChanges,
		rootToRootTransfers: rootTransfers,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	while (creations.size > 0 || rootChanges.size > 0 || rootTransfers.size > 0) {
		for (const insert of creations) {
			creations.delete(insert);
			const firstRoot = insertToRootId.get(insert);
			assert(firstRoot !== undefined, "Expected to find a root ID for the creation");
			for (let i = 0; i < insert.content.length; i += 1) {
				const root: ForestRootId = brand(firstRoot + i);
				const field = detachedFieldIndex.toFieldKey(root);
				visitor.create([insert.content[i]], field);
			}
		}
		for (const [root, modifications] of rootChanges) {
			rootChanges.delete(root);
			const field = detachedFieldIndex.toFieldKey(root);
			visitor.enterField(field);
			visitNode(0, modifications, visitor, detachConfig);
			visitor.exitField(field);
		}
		transferRoots(rootTransfers, detachedFieldIndex, visitor);
	}
	const attachConfig: PassConfig = {
		name: "attach",
		func: attachPass,
		modsToMovedTrees,
		detachedFieldIndex,
		insertToRootId,
		creations,
		rootChanges,
		rootToRootTransfers: rootTransfers,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	while (rootTransfers.size > 0 || rootChanges.size > 0) {
		transferRoots(rootTransfers, detachedFieldIndex, visitor);
		for (const [root, modifications] of rootChanges) {
			rootChanges.delete(root);
			const field = detachedFieldIndex.toFieldKey(root);
			visitor.enterField(field);
			visitNode(0, modifications, visitor, attachConfig);
			visitor.exitField(field);
		}
	}
}

type RootTransfers = Map<
	ForestRootId,
	{
		/**
		 * The node ID that characterizes the detached field of origin.
		 * Used to delete the entry from the tree index once the root is transferred.
		 * If undefined, the root was created due to an insert.
		 */
		nodeId?: Delta.DetachedNodeId;
		destination: ForestRootId;
	}
>;

function transferRoots(
	rootTransfers: RootTransfers,
	detachedFieldIndex: DetachedFieldIndex,
	visitor: DeltaVisitor,
) {
	for (const [source, { nodeId, destination }] of rootTransfers) {
		rootTransfers.delete(source);
		const sourceField = detachedFieldIndex.toFieldKey(source);
		const destinationField = detachedFieldIndex.toFieldKey(destination);
		visitor.enterField(sourceField);
		visitor.detach({ start: 0, end: 1 }, destinationField);
		visitor.exitField(sourceField);
		if (nodeId !== undefined) {
			detachedFieldIndex.deleteEntry(nodeId);
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
	/**
	 * Creates nodes for the given content in a new detached field.
	 * @param content - The content to create.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	create(content: Delta.ProtoNodes, destination: FieldKey): void;
	/**
	 * Recursively destroys the given detached field and all of the nodes within it.
	 * @param detachedField - The key for the detached field to destroy.
	 * @param count - The number of nodes being destroyed.
	 * Expected to match the number of nodes in the detached field being destroyed.
	 */
	destroy(detachedField: FieldKey, count: number): void;
	/**
	 * Transfers all the nodes from a detached field to the current field.
	 * @param source - The detached field to transfer the nodes from.
	 * @param count - The number of nodes being attached.
	 * Expected to match the number of nodes in the source detached field.
	 * @param destination - The index at which to attach the nodes.
	 */
	attach(source: FieldKey, count: number, destination: PlaceIndex): void;
	/**
	 * Transfers a range of nodes from the current field to a new detached field.
	 * @param source - The bounds of the range of nodes to detach.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	detach(source: Range, destination: FieldKey): void;
	/**
	 * Replaces a range of nodes in the current field by transferring them out to a new detached field
	 * and transferring in all the nodes from an existing detached field in their place.
	 * The number of nodes being detached must match the number of nodes being attached.
	 * @param newContentSource - The detached field to transfer the new nodes from.
	 * @param range - The bounds of the range of nodes to replace.
	 * @param oldContentDestination - The key for a new detached field to transfer the old nodes to.
	 */
	replace(newContentSource: FieldKey, range: Range, oldContentDestination: FieldKey): void;

	enterNode(index: NodeIndex): void;
	exitNode(index: NodeIndex): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly name: "detach" | "attach";
	readonly func: Pass;
	readonly detachedFieldIndex: DetachedFieldIndex;

	/**
	 * The new trees that need to be created.
	 * Only used in the detach pass.
	 */
	readonly creations: Set<Delta.Insert>;
	/**
	 * Nested changes that need to be applied to detached roots.
	 * In the detach pass, this is used for:
	 * - Changes under newly created trees (since they are created in a detached field)
	 * - Changes under existing trees that start out as being removed (no matter what happens to them during this visit)
	 * In the attach pass, this is used for:
	 * - Changes under trees end up as removed as part of this visit (no matter what happened to them during this visit)
	 */
	readonly rootChanges: Map<ForestRootId, Delta.FieldMarks>;
	/**
	 * Represents transfers of roots from one detached field to another.
	 * In the detach pass, this is used for:
	 * - Transferring a removed node (that is being moved) to the detached field that corresponds to the move ID
	 * In the attach pass, this is used for:
	 * - Transferring a created node (that is transient) to the detached field that corresponds to its detach ID
	 * - Transferring a restored node (that is transient) to the detached field that corresponds to its detach ID
	 * - Transferring a moved node (that is removed) to the detached field that corresponds to its detach ID
	 * TODO#5481: update the DetachedFieldIndex instead of moving the nodes around.
	 */
	readonly rootToRootTransfers: RootTransfers;
	/**
	 * Stores the nested changes for all moved trees.
	 */
	readonly modsToMovedTrees: Map<Delta.MoveId, Delta.FieldMarks>;
	/**
	 * All creations are made in a detached field and eventually transferred to their final destination.
	 * This map keeps track of the root ID where creations occur.
	 */
	readonly insertToRootId: Map<Delta.Insert, ForestRootId>;
}

function ensureCreation(mark: Delta.Insert, config: PassConfig): ForestRootId {
	const existing = config.insertToRootId.get(mark);
	if (existing !== undefined) {
		return existing;
	}
	const { root } = config.detachedFieldIndex.createEntry(undefined, mark.content.length);
	config.insertToRootId.set(mark, root);
	config.creations.add(mark);
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

function visitNode(
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

/**
 * Normalizes the mark into a list of replaces that should apply to the current pass and in the current field.
 * The "in the current pass" restriction means that...
 * - In the detach pass, operations that represent attaches are ignored (replaces are also ignored).
 * - In the attach pass, operations that represent detaches are ignored (replaces are not ignored).
 * The "in the current field" restriction means that...
 * - In the detach pass, operations that target nodes which start out as detached are ignored.
 * - In the attach pass, operations that target nodes that will end up as detached are ignored.
 *
 * Does not mutate `config` members aside from idempotent tree index queries that may lead to the creation of new entries.
 */
function asReplaces(
	mark: Exclude<Delta.Mark, number | Delta.Modify<any>>,
	config: PassConfig,
): Replace[] {
	// Inline into `switch(mark.type)` once we upgrade to TS 4.7
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Remove: {
			if (config.name === "detach") {
				return makeArray(mark.count, (i) => {
					const { root } = config.detachedFieldIndex.getOrCreateEntry(
						offsetDetachId(mark.detachId, i),
					);
					return {
						oldContent: { fields: mark.fields, destination: root },
					};
				});
			}
			break;
		}
		case Delta.MarkType.MoveOut: {
			if (config.name === "detach" && mark.detachedNodeId === undefined) {
				const minor = extractFromOpaque(mark.moveId);
				return makeArray(mark.count, (i) => {
					const detachId = {
						major: "move",
						minor: minor + i,
					};
					const { root } = config.detachedFieldIndex.getOrCreateEntry(detachId);
					return {
						oldContent: { fields: mark.fields, destination: root },
					};
				});
			}
			break;
		}
		case Delta.MarkType.MoveIn: {
			if (config.name === "attach" && mark.detachId === undefined) {
				const minor = extractFromOpaque(mark.moveId);
				const fields = config.modsToMovedTrees.get(mark.moveId);
				return makeArray(mark.count, (i) => {
					const nodeId = {
						major: "move",
						minor: minor + i,
					};
					const { root } = config.detachedFieldIndex.getOrCreateEntry(nodeId);
					return { newContent: { source: root, nodeId, fields } };
				});
			}
			break;
		}
		case Delta.MarkType.Insert: {
			if (mark.content.length === 0) {
				break;
			}
			if (mark.detachId === undefined || mark.oldContent !== undefined) {
				if (config.name === "detach" && mark.detachId === undefined) {
					// Wait for the attach pass to handle true replacement
					break;
				}
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
						const { root: oldContentDestination } =
							config.detachedFieldIndex.getOrCreateEntry(
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
			break;
		}
		case Delta.MarkType.Restore: {
			if (mark.newContent.detachId === undefined || mark.oldContent !== undefined) {
				if (config.name === "detach" && mark.newContent.detachId === undefined) {
					// Wait for the attach pass to handle true replacement
					break;
				}
				return makeArray(mark.count, (i) => {
					const replace: Mutable<Replace> = {};
					if (mark.newContent.detachId === undefined) {
						const nodeId = offsetDetachId(mark.newContent.restoreId, i);
						const { root: restoredRoot } = config.detachedFieldIndex.getEntry(nodeId);
						const newContent = { source: restoredRoot, nodeId, fields: mark.fields };
						replace.newContent = newContent;
					}
					if (mark.oldContent !== undefined) {
						const { root } = config.detachedFieldIndex.getOrCreateEntry(
							offsetDetachId(mark.oldContent.detachId, i),
						);
						replace.oldContent = { destination: root, fields: mark.oldContent.fields };
					}
					return replace;
				});
			}
			break;
		}
		default:
			unreachableCase(type);
	}
	return [];
}

/**
 * Populates the `config` members with operations that need to be performed on detached roots as part of the detach pass.
 */
function catalogDetachPassRootChanges(mark: Exclude<Delta.Mark, number>, config: PassConfig): void {
	let nodeId: Delta.DetachedNodeId | undefined;
	let fields: Delta.FieldMarks | undefined;
	switch (mark.type) {
		case Delta.MarkType.Insert: {
			if (mark.content.length > 0) {
				const root = ensureCreation(mark, config);
				if (mark.fields !== undefined) {
					config.rootChanges.set(root, mark.fields);
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
				const { root: rootSource } = config.detachedFieldIndex.getEntry(nodeId);
				const { root: rootDestination } =
					config.detachedFieldIndex.getOrCreateEntry(destinationNodeId);
				addRootReplaces(mark.count, config, rootDestination, rootSource, nodeId);
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
		const { root } = config.detachedFieldIndex.getOrCreateEntry(nodeId);
		config.rootChanges.set(root, fields);
	}
}

/**
 * Populates the `config` members with operations that need to be performed on detached roots as part of the attach pass.
 */
function catalogAttachPassRootChanges(mark: Exclude<Delta.Mark, number>, config: PassConfig): void {
	let nodeId: Delta.DetachedNodeId | undefined;
	let fields: Delta.FieldMarks | undefined;
	switch (mark.type) {
		case Delta.MarkType.Insert: {
			if (mark.content.length > 0) {
				const rootSource = config.insertToRootId.get(mark);
				assert(
					rootSource !== undefined,
					"content should've been created in the detach pass",
				);
				nodeId = mark.detachId;
				fields = mark.fields;
				if (mark.detachId !== undefined) {
					const count = mark.content.length;
					const { root: rootDestination } = config.detachedFieldIndex.getOrCreateEntry(
						mark.detachId,
						count,
					);
					addRootReplaces(count, config, rootDestination, rootSource);
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
				const { root: rootSource } =
					config.detachedFieldIndex.getOrCreateEntry(sourceNodeId);
				const { root: rootDestination } = config.detachedFieldIndex.getOrCreateEntry(
					mark.detachId,
				);
				addRootReplaces(mark.count, config, rootDestination, rootSource, sourceNodeId);
			}
			break;
		}
		case Delta.MarkType.Restore: {
			if (mark.newContent.detachId !== undefined) {
				nodeId = mark.newContent.detachId;
				fields = mark.fields;
				const { root: rootSource } = config.detachedFieldIndex.getOrCreateEntry(
					mark.newContent.restoreId,
				);
				const { root: rootDestination } = config.detachedFieldIndex.getOrCreateEntry(
					mark.newContent.detachId,
				);
				addRootReplaces(
					mark.count,
					config,
					rootDestination,
					rootSource,
					mark.newContent.restoreId,
				);
			}
			break;
		}
		case Delta.MarkType.Remove: {
			nodeId = mark.detachId;
			fields = mark.fields;
			break;
		}
		default:
			break;
	}
	if (nodeId !== undefined && fields !== undefined) {
		const { root } = config.detachedFieldIndex.getOrCreateEntry(nodeId);
		config.rootChanges.set(root, fields);
	}
}

function addRootReplaces(
	count: number,
	config: PassConfig,
	destination: ForestRootId,
	source: ForestRootId,
	sourceNodeId?: Delta.DetachedNodeId,
) {
	// It's possible for a detached node to be revived transiently such that it ends up back in the same detached field.
	// Making such a transfer wouldn't just be inefficient, it would lead us to mistakenly think we have moved all content
	// out of the source detached field, and would lead us to delete the tree index entry for that source detached field.
	// This would effectively result in the tree index missing an entry for the detached field.
	// This if statement prevents that from happening.
	if (source !== destination) {
		for (let i = 0; i < count; i += 1) {
			config.rootToRootTransfers.set(brand(source + i), {
				destination: brand(destination + i),
				nodeId: offsetDetachId(sourceNodeId, i),
			});
		}
	}
}

/**
 * Preforms the following:
 * - Collects all root creations
 * - Collects all roots that need a detach pass
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
					visitNode(index, mark.fields, visitor, config);
					index += 1;
				}
			} else {
				if (mark.type === Delta.MarkType.MoveOut && mark.fields !== undefined) {
					config.modsToMovedTrees.set(mark.moveId, mark.fields);
				}
				const replaces = asReplaces(mark, config);
				for (const { oldContent, newContent } of replaces) {
					if (oldContent !== undefined) {
						visitNode(index, oldContent.fields, visitor, config);
						if (newContent === undefined) {
							// This a simple detach
							const oldRoot = oldContent.destination;
							const field = config.detachedFieldIndex.toFieldKey(brand(oldRoot));
							visitor.detach({ start: index, end: index + 1 }, field);
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

/**
 * Preforms the following:
 * - Collects all roots that need an attach pass
 * - Executes attaches (top-down)
 * - Executes replaces (top-down)
 */
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
					visitNode(index, mark.fields, visitor, config);
					index += 1;
				}
			} else {
				const replaces = asReplaces(mark, config);
				for (const { oldContent, newContent } of replaces) {
					if (newContent !== undefined) {
						const newRoot = newContent.source;
						const newContentField = config.detachedFieldIndex.toFieldKey(newRoot);
						if (oldContent !== undefined) {
							// This is a true replace.
							const oldRoot = oldContent.destination;
							const oldContentField = config.detachedFieldIndex.toFieldKey(oldRoot);
							visitor.replace(
								newContentField,
								{ start: index, end: index + 1 },
								oldContentField,
							);
						} else {
							// This a simple attach
							visitor.attach(brand(newContentField), 1, index);
						}
						if (newContent.nodeId !== undefined) {
							config.detachedFieldIndex.deleteEntry(newContent.nodeId);
						}
						visitNode(index, newContent.fields, visitor, config);
						index += 1;
					}
				}
			}
		}
	}
}
