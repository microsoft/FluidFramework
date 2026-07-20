/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangeAtomIdRangeMap,
	DeltaDetachedNodeId,
	DeltaFieldMap,
	DeltaRoot,
	ExclusiveMapTree,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import {
	makeAnonChange,
	makeChangeAtomId,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
} from "../../core/index.js";
import type { Mutable, RangeQueryResult } from "../../util/index.js";
import { brand } from "../../util/index.js";

import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
} from "../changeAtomIdBTree.js";
import type { TreeChunk } from "../chunked-forest/index.js";
import { chunkTree, combineChunks, defaultChunkPolicy } from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";

import type { FlexFieldKind } from "./fieldKind.js";
import {
	getChangeHandler,
	intoDelta,
	type ModularChangeFamily,
} from "./modularChangeFamily.js";
import type {
	CrossFieldKeyTable,
	FieldChangeMap,
	FieldChangeset,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { newCrossFieldKeyTable } from "./modularChangeTypes.js";
import {
	type EditFilterFunc,
	EditFilterStatus,
	NodeAttachState,
} from "./fieldChangeHandler.js";
import { nodeChangeFromId } from "./modularChangeUtils.js";

/**
 * A set of detached node IDs, keyed by revision then by the numeric portion (`localId`/`minor`) of the ID.
 */
type DetachedNodeIdSet = Map<RevisionTag | undefined, Set<number>>;

/** Chunking policy used to re-chunk a build when it is split into smaller builds. */
const minimizeChunkCompressor = {
	policy: defaultChunkPolicy,
	idCompressor: undefined,
} as const;

function addToDetachedNodeIdSet(
	set: DetachedNodeIdSet,
	revision: RevisionTag | undefined,
	localId: number,
): void {
	const minors = set.get(revision) ?? new Set<number>();
	minors.add(localId);
	set.set(revision, minors);
}

function detachedNodeIdSetHas(
	set: DetachedNodeIdSet,
	revision: RevisionTag | undefined,
	localId: number,
): boolean {
	return set.get(revision)?.has(localId) ?? false;
}

/**
 * Indexes a delta's {@link DeltaRoot.global | global} detached-node changes by their node ID.
 *
 * @remarks
 * `DeltaRoot.global` describes modifications to nodes that are built and/or removed by the change,
 * keyed by node ID. This builds a `revision -> localId -> fields` lookup so those per-node
 * {@link DeltaFieldMap | field changes} can be resolved quickly (for example, when trimming transient
 * content out of a surviving node's build tree).
 */
function indexGlobalById(
	delta: DeltaRoot,
): Map<RevisionTag | undefined, Map<number, DeltaFieldMap>> {
	const globalById = new Map<RevisionTag | undefined, Map<number, DeltaFieldMap>>();
	if (delta.global !== undefined) {
		for (const { id, fields } of delta.global) {
			const byMinor = globalById.get(id.major) ?? new Map<number, DeltaFieldMap>();
			byMinor.set(id.minor, fields);
			globalById.set(id.major, byMinor);
		}
	}
	return globalById;
}

/**
 * An adjacency index over a delta's {@link DeltaRoot.rename | renames}, built once and shared by the passes that
 * classify detached content.
 *
 * @remarks
 * Each rename links the ID a piece of detached content had before the rename (`oldId`) to the ID it has after
 * (`newId`). As transient content is moved within a change it acquires a chain of such IDs (build cell → move id →
 * detach output). `backward` maps each post-rename ID to its pre-rename IDs; `forward` maps each pre-rename ID to its
 * post-rename IDs. Both are keyed by revision then by the numeric portion of the ID.
 */
interface RenameGraph {
	readonly forward: Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>;
	readonly backward: Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>;
}

/** Looks up the neighbors of a node ID in one direction of a {@link RenameGraph}. */
function renameNeighbors(
	direction: Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>,
	major: RevisionTag | undefined,
	minor: number,
): readonly DeltaDetachedNodeId[] {
	return direction.get(major)?.get(minor) ?? [];
}

/**
 * Builds a {@link RenameGraph} from a delta's renames in a single pass, so the rename links can be traversed by ID
 * without repeatedly scanning the rename list.
 */
function buildRenameGraph(delta: DeltaRoot): RenameGraph {
	const forward = new Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>();
	const backward = new Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>();
	const addEdge = (
		direction: Map<RevisionTag | undefined, Map<number, DeltaDetachedNodeId[]>>,
		from: DeltaDetachedNodeId,
		to: DeltaDetachedNodeId,
	): void => {
		const byMinor = direction.get(from.major) ?? new Map<number, DeltaDetachedNodeId[]>();
		const neighbors = byMinor.get(from.minor) ?? [];
		neighbors.push(to);
		byMinor.set(from.minor, neighbors);
		direction.set(from.major, byMinor);
	};
	if (delta.rename !== undefined) {
		for (const { oldId, newId, count } of delta.rename) {
			for (let offset = 0; offset < count; offset += 1) {
				const oldAtom: DeltaDetachedNodeId = {
					major: oldId.major,
					minor: oldId.minor + offset,
				};
				const newAtom: DeltaDetachedNodeId = {
					major: newId.major,
					minor: newId.minor + offset,
				};
				addEdge(forward, oldAtom, newAtom);
				addEdge(backward, newAtom, oldAtom);
			}
		}
	}
	return { forward, backward };
}

/**
 * Collects the set of detached node IDs whose content ends up attached within the live document tree
 * once the given change is applied.
 *
 * @remarks
 * These are the "used" detached nodes: any build whose nodes are not in this set has no observable
 * effect on the resulting document and can be dropped.
 *
 * The delta's marks describe changes to a field: an `attach` brings a detached node into the live
 * tree, while `mark.fields` describes edits to the *pre-existing* content of the cell (which is being
 * detached/removed when `mark.detach` is set). Nested content of freshly built/attached nodes is not
 * carried on the attach mark itself; it is expressed via `DeltaRoot.global` keyed by the node's ID.
 * Consequently this walk only descends into a node's nested content when that node itself remains in
 * the live tree, so that content attached beneath a removed node is correctly treated as unused.
 */
function collectAttachedDetachedNodeIds(
	delta: DeltaRoot,
	globalById: Map<RevisionTag | undefined, Map<number, DeltaFieldMap>>,
	renameGraph: RenameGraph,
): DetachedNodeIdSet {
	const attached: DetachedNodeIdSet = new Map();
	// Worklist of detached node IDs newly discovered to be live, whose own nested content must be visited.
	const worklist: DeltaDetachedNodeId[] = [];
	const markLive = (major: RevisionTag | undefined, minor: number): void => {
		if (!detachedNodeIdSetHas(attached, major, minor)) {
			addToDetachedNodeIdSet(attached, major, minor);
			worklist.push({ major, minor });
		}
	};

	const visitLiveFields = (fields: DeltaFieldMap | undefined): void => {
		if (fields === undefined) {
			return;
		}
		for (const field of fields.values()) {
			for (const mark of field.marks) {
				if (mark.attach !== undefined) {
					for (let offset = 0; offset < mark.count; offset += 1) {
						markLive(mark.attach.major, mark.attach.minor + offset);
					}
				}
				// `mark.fields` edits the cell's pre-existing content. Only descend when that content
				// stays in the live tree (i.e. it is not being detached out of the tree).
				if (mark.detach === undefined) {
					visitLiveFields(mark.fields);
				}
			}
		}
	};

	visitLiveFields(delta.fields);

	// Process nodes discovered to be live: pull in their nested content (from `global`) and propagate
	// liveness backwards across renames (a node attached under its post-rename ID was built under its
	// pre-rename ID). Iterate to a fixed point.
	while (worklist.length > 0) {
		const next = worklist.pop();
		if (next === undefined) {
			break;
		}
		const { major, minor } = next;
		visitLiveFields(globalById.get(major)?.get(minor));
		// A node attached under its post-rename ID was built under its pre-rename ID, so its pre-rename
		// IDs are live too.
		for (const oldId of renameNeighbors(renameGraph.backward, major, minor)) {
			markLive(oldId.major, oldId.minor);
		}
	}

	return attached;
}

/**
 * Computes the set of "dead" node IDs: the IDs that refer to content built by this change but which does not survive it.
 *
 * @remarks
 * A build cell is "dead" when its content is not {@link collectAttachedDetachedNodeIds | attached} in the resulting
 * document. As transient content is detached and moved within the change, it acquires further IDs (move ids and detach
 * output cells); these appear as {@link DeltaRoot.rename | renames} in the change's delta, linking each new ID to the
 * one it replaced. This walks those rename links (in both directions) from every dead build cell to a fixed point, so
 * that every ID which ever refers to a piece of transient content is included. Field effects (attaches/detaches) that
 * target a dead ID have no observable effect and are removed during minimization.
 */
function computeDeadIds(
	builds: ChangeAtomIdBTree<TreeChunk>,
	renameGraph: RenameGraph,
	attached: DetachedNodeIdSet,
): DetachedNodeIdSet {
	const dead: DetachedNodeIdSet = new Map();
	const worklist: DeltaDetachedNodeId[] = [];
	const markDead = (major: RevisionTag | undefined, minor: number): void => {
		if (!detachedNodeIdSetHas(dead, major, minor)) {
			addToDetachedNodeIdSet(dead, major, minor);
			worklist.push({ major, minor });
		}
	};

	// Seed with every build cell whose content does not survive.
	for (const [[revision, localId], chunk] of builds.entries()) {
		for (let offset = 0; offset < chunk.topLevelLength; offset += 1) {
			if (!detachedNodeIdSetHas(attached, revision, localId + offset)) {
				markDead(revision, localId + offset);
			}
		}
	}

	// Propagate deadness across rename links (in both directions) to a fixed point.
	while (worklist.length > 0) {
		const next = worklist.pop();
		if (next === undefined) {
			break;
		}
		for (const neighbor of renameNeighbors(renameGraph.forward, next.major, next.minor)) {
			markDead(neighbor.major, neighbor.minor);
		}
		for (const neighbor of renameNeighbors(renameGraph.backward, next.major, next.minor)) {
			markDead(neighbor.major, neighbor.minor);
		}
	}

	return dead;
}

/**
 * Computes the set of detach destinations whose detached content was built inline within a surviving node's build tree
 * and is being trimmed out of that build during minimization.
 *
 * @remarks
 * When a node survives the change, its build tree is retained but {@link trimMapTree | trimmed} of any transient content
 * nested within it. A field change that detaches such trimmed content out of the surviving build must treat its input
 * as already empty, since the content it expected to detach is being removed from the build. This walks the
 * {@link DeltaFieldMap | field changes} recorded for each surviving build (via `globalById`) and records the
 * destinations of every detach whose content does not survive.
 */
function computeTrimmedInputDetaches(
	builds: ChangeAtomIdBTree<TreeChunk>,
	globalById: Map<RevisionTag | undefined, Map<number, DeltaFieldMap>>,
	isLive: (id: ChangeAtomId) => boolean,
): DetachedNodeIdSet {
	const trimmed: DetachedNodeIdSet = new Map();
	const visit = (deltaFields: DeltaFieldMap | undefined): void => {
		if (deltaFields === undefined) {
			return;
		}
		for (const field of deltaFields.values()) {
			for (const mark of field.marks) {
				if (mark.detach !== undefined) {
					for (let offset = 0; offset < mark.count; offset += 1) {
						const localId = mark.detach.minor + offset;
						if (!isLive({ revision: mark.detach.major, localId: brand(localId) })) {
							addToDetachedNodeIdSet(trimmed, mark.detach.major, localId);
						}
					}
				}
				if (mark.fields !== undefined) {
					visit(mark.fields);
				}
			}
		}
	};

	for (const [[revision, localId], chunk] of builds.entries()) {
		for (let offset = 0; offset < chunk.topLevelLength; offset += 1) {
			if (isLive({ revision, localId: brand(localId + offset) })) {
				visit(globalById.get(revision)?.get(localId + offset));
			}
		}
	}

	return trimmed;
}

/**
 * Resolves a node ID through the change's alias table to its canonical form.
 */
function normalizeNodeId(nodeId: NodeId, nodeAliases: ChangeAtomIdBTree<NodeId>): NodeId {
	let currentId = nodeId;
	for (;;) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}
		currentId = dealiased;
	}
}

/**
 * Rewrites a {@link ModularChangeset}'s field and node changes to remove the effects of "transient" content: content
 * that is built by the change but does not survive it.
 *
 * @remarks
 * The field-level effects that attach and detach transient content are stripped by delegating to each field's
 * {@link FieldChangeRebaser.filterEdits}. Attaches of dead content are removed (via `isDead`), as are detaches whose
 * content is dead or was trimmed out of a surviving node's build tree (via `isDead` / `isTrimmedInputDetach`). While
 * rewriting, the derived indexes (`nodeChanges`, `nodeToParent`, and `crossFieldKeys`) are rebuilt from scratch so that
 * any node change or cross-field key that becomes unreferenced as a result of the removed effects is dropped.
 */
class ModularChangeEditMinimizer {
	private readonly newNodeChanges = newChangeAtomIdBTree<NodeChangeset>();
	private readonly newNodeToParent = newChangeAtomIdBTree<FieldId>();
	private readonly newCrossFieldKeys: CrossFieldKeyTable = newCrossFieldKeyTable();
	private readonly processedNodes = new Set<string>();
	private readonly filterAttaches: EditFilterFunc;
	private readonly filterDetaches: EditFilterFunc;

	public constructor(
		private readonly change: ModularChangeset,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
		private readonly isDead: (id: ChangeAtomId) => boolean,
		private readonly isTrimmedInputDetach: (id: ChangeAtomId) => boolean,
	) {
		this.filterAttaches = (id, count, endpoint) =>
			this.filterRange(id, count, endpoint, (atom) => this.isDead(atom));
		this.filterDetaches = (id, count, endpoint) =>
			this.filterRange(
				id,
				count,
				endpoint,
				(atom) => this.isDead(atom) || this.isTrimmedInputDetach(atom),
			);
	}

	/**
	 * Rebuild the field/node changes and their derived indexes, omitting the
	 * effects of transient nodes and any node changes that become unreferenced
	 * as a result.
	 */
	public minimizeEdits(): Mutable<ModularChangeset> {
		const fieldChanges = this.rewriteFieldMap(this.change.fieldChanges, undefined);
		return {
			...this.change,
			fieldChanges,
			nodeChanges: this.newNodeChanges,
			nodeToParent: this.newNodeToParent,
			crossFieldKeys: this.newCrossFieldKeys,
		};
	}

	/**
	 * Reports, for a range of attaches or detaches starting at `id`, whether each is removed (targets dead content) or
	 * preserved. Returns the length of the leading run of identically-classified cells so the caller can re-query the
	 * remainder.
	 *
	 * @param shouldRemove - Predicate reporting whether a single id targets content whose effect should be removed.
	 * Both the effect's own id and (for moves) its endpoint id are consulted, since either may identify the content
	 * being carried.
	 */
	private filterRange(
		id: ChangeAtomId,
		count: number,
		endpoint: ChangeAtomId | undefined,
		shouldRemove: (id: ChangeAtomId) => boolean,
	): RangeQueryResult<EditFilterStatus> {
		const isRemoved = (offset: number): boolean =>
			shouldRemove(offsetChangeAtomId(id, offset)) ||
			(endpoint !== undefined && shouldRemove(offsetChangeAtomId(endpoint, offset)));
		const removeFirst = isRemoved(0);
		let length = 1;
		while (length < count && isRemoved(length) === removeFirst) {
			length += 1;
		}
		return {
			value: removeFirst ? EditFilterStatus.Remove : EditFilterStatus.Preserve,
			length,
		};
	}

	private rewriteFieldMap(
		fieldMap: FieldChangeMap,
		parentNodeId: NodeId | undefined,
	): FieldChangeMap {
		const rewritten: FieldChangeMap = new Map();
		for (const [field, fieldChange] of fieldMap) {
			const handler = getChangeHandler(this.fieldKinds, fieldChange.fieldKind);
			const prunedChange: FieldChangeset = brand(
				handler.rebaser.filterEdits(fieldChange.change, {
					filterAttach: this.filterAttaches,
					filterDetach: this.filterDetaches,
					// TODO: Testing says this needs to be false. Explain why in comment here.
					preserveOtherEdits: false,
				}),
			);

			const fieldId: FieldId = { nodeId: parentNodeId, field };
			for (const { key, count } of handler.getCrossFieldKeys(prunedChange)) {
				this.newCrossFieldKeys.set(key, count, fieldId);
			}
			for (const { nodeId } of handler.getNestedChanges(prunedChange)) {
				this.rewriteNode(nodeId, fieldId);
			}

			if (!handler.isEmpty(prunedChange)) {
				rewritten.set(field, { ...fieldChange, change: prunedChange });
			}
		}
		return rewritten;
	}

	private rewriteNode(nodeId: NodeId, parentFieldId: FieldId): void {
		const canonical = normalizeNodeId(nodeId, this.change.nodeAliases);
		const key = `${canonical.revision === undefined ? "" : String(canonical.revision)}:${canonical.localId}`;
		if (this.processedNodes.has(key)) {
			return;
		}
		this.processedNodes.add(key);
		setInChangeAtomIdMap(this.newNodeToParent, canonical, parentFieldId);

		const nodeChangeset = getFromChangeAtomIdMap(this.change.nodeChanges, canonical);
		assert(nodeChangeset !== undefined, "Unknown node ID referenced by field change");

		const newFields =
			nodeChangeset.fieldChanges === undefined
				? undefined
				: this.rewriteFieldMap(nodeChangeset.fieldChanges, canonical);

		const newNode: Mutable<NodeChangeset> = { ...nodeChangeset };
		if (newFields !== undefined && newFields.size > 0) {
			newNode.fieldChanges = newFields;
		} else {
			delete newNode.fieldChanges;
		}
		setInChangeAtomIdMap(this.newNodeChanges, canonical, newNode);
	}
}

/** Splits a chunk into one chunk per top-level node, in order. */
function splitChunkIntoNodes(chunk: TreeChunk): TreeChunk[] {
	const cursor = chunk.cursor();
	cursor.firstNode();
	const nodes: TreeChunk[] = [];
	for (let index = 0; index < chunk.topLevelLength; index += 1) {
		nodes.push(chunkTree(cursor, minimizeChunkCompressor));
		cursor.nextNode();
	}
	return nodes;
}

/** Extracts the single top-level node of a chunk as a mutable {@link ExclusiveMapTree}. */
function mapTreeFromNodeChunk(chunk: TreeChunk): ExclusiveMapTree {
	const cursor = chunk.cursor();
	cursor.firstNode();
	return mapTreeFromCursor(cursor);
}

/**
 * Trims transient content from a built node's in-memory tree, in place.
 *
 * @returns The number of children removed from the node's fields.
 *
 * @remarks
 * `deltaFields` is the {@link DeltaFieldMap} describing the modifications made to the built node (as
 * produced in the change's delta `global` section, keyed by the node's build ID). It is walked in
 * lockstep with `node`'s fields: a `detach` mark whose target cell is not live removes the corresponding
 * (transient) child from the tree, and a `fields` mark descends into a surviving child to trim its own
 * transient descendants. Content brought in by `attach`-only marks lives in a separate build and is not
 * inlined here, so those marks consume no existing child.
 */
function trimMapTree(
	node: ExclusiveMapTree,
	deltaFields: DeltaFieldMap,
	isLive: (id: ChangeAtomId) => boolean,
): number {
	let changes = 0;
	for (const [fieldKey, fieldChanges] of deltaFields) {
		if (fieldChanges.marks.length === 0) {
			continue;
		}
		const children = node.fields.get(fieldKey);
		if (children === undefined) {
			continue;
		}
		const newChildren: ExclusiveMapTree[] = [];
		let fieldChangeCount = 0;
		let childIndex = 0;
		for (const mark of fieldChanges.marks) {
			if (mark.detach !== undefined) {
				// The detached children are the field's existing (built) content being removed.
				for (let offset = 0; offset < mark.count; offset += 1) {
					if (
						isLive({ revision: mark.detach.major, localId: brand(mark.detach.minor + offset) })
					) {
						// Detached to a cell that survives elsewhere: retain the content.
						newChildren.push(children[childIndex] ?? oob());
					} else {
						fieldChangeCount += 1;
					}
					childIndex += 1;
				}
			} else if (mark.fields !== undefined) {
				// A surviving child that has its own nested modifications.
				const child = children[childIndex] ?? oob();
				fieldChangeCount += trimMapTree(child, mark.fields, isLive);
				newChildren.push(child);
				childIndex += 1;
			} else if (mark.attach === undefined) {
				// Unchanged run of existing children.
				for (let offset = 0; offset < mark.count; offset += 1) {
					newChildren.push(children[childIndex] ?? oob());
					childIndex += 1;
				}
			}
			// Otherwise the mark only attaches new content from a separate build,
			// which is not inlined in this node, so there is nothing to copy over.
		}
		if (fieldChangeCount === 0) {
			// No changes to this field's content, so no need to update the field.
			continue;
		}
		// Any children beyond the marks are unchanged trailing content.
		while (childIndex < children.length) {
			newChildren.push(children[childIndex] ?? oob());
			childIndex += 1;
		}
		if (newChildren.length === 0) {
			node.fields.delete(fieldKey);
		} else {
			node.fields.set(fieldKey, newChildren);
		}
		changes += fieldChangeCount;
	}
	return changes;
}

/**
 * Computes the minimized set of builds for a change.
 *
 * @remarks
 * Iterates over the change's original `builds`, dropping any build whose nodes are entirely unused and splitting any
 * partially-used build so that only the runs of used (live) nodes are retained. Transient content nested within a
 * surviving node's build tree is trimmed via {@link trimMapTree}, re-chunking the node when its tree was modified.
 *
 * @param buildsIn - The original builds from the change to be minimized.
 * @param globalById - The `revision -> localId -> fields` lookup for the change's delta.
 * @param isLive - Predicate reporting whether the node with the given {@link ChangeAtomId} ends up attached in the
 * resulting document.
 * @returns The minimized builds.
 */
function computeMinimizedBuilds(
	buildsIn: ChangeAtomIdBTree<TreeChunk>,
	globalById: Map<RevisionTag | undefined, Map<number, DeltaFieldMap>>,
	isLive: (id: ChangeAtomId) => boolean,
): ChangeAtomIdBTree<TreeChunk> {
	const buildsOut = newChangeAtomIdBTree<TreeChunk>();
	const droppedBuildIds: DetachedNodeIdSet = new Map();

	for (const [[revision, changeSetLocalId], chunk] of buildsIn.entries()) {
		const nodeChunks = splitChunkIntoNodes(chunk);

		// The chunks for a run of consecutive used nodes, flushed as a single build entry.
		let runChunks: TreeChunk[] = [];
		let runStart: number | undefined;
		const flushRun = (): void => {
			if (runStart !== undefined && runChunks.length > 0) {
				buildsOut.set([revision, brand(runStart)], combineChunks(runChunks));
			}
			runChunks = [];
			runStart = undefined;
		};

		for (let index = 0; index < nodeChunks.length; index += 1) {
			let nodeChunk = nodeChunks[index] ?? oob();
			const localId = changeSetLocalId + index;
			if (isLive({ revision, localId: brand(localId) })) {
				// This top-level node survives. Trim any transient content nested within its built tree.
				const globalFields = globalById.get(revision)?.get(localId);
				if (globalFields !== undefined) {
					const mapTree = mapTreeFromNodeChunk(nodeChunk);
					if (trimMapTree(mapTree, globalFields, isLive) > 0) {
						// The node's build tree was modified, so re-chunk it to reflect the trimmed content.
						nodeChunk.referenceRemoved();
						nodeChunk = chunkTree(cursorForMapTreeNode(mapTree), minimizeChunkCompressor);
					}
				}

				runStart ??= localId;
				runChunks.push(nodeChunk);
			} else {
				addToDetachedNodeIdSet(droppedBuildIds, revision, localId);
				nodeChunk.referenceRemoved();
				flushRun();
			}
		}
		flushRun();
	}

	return buildsOut;
}

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 *
 * @remarks
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * Every node created during the change contributes a `build`. Once the change is squashed, a build is only meaningful
 * for nodes that remain attached in the resulting document. This function inspects the change's
 * {@link intoDelta | delta} to determine which built nodes end up attached ("transient" nodes are those that do not),
 * then:
 *
 * - removes the field-level effects (e.g. sequence-field marks) that attach and detach each transient node, delegating
 * to each field's {@link FieldChangeRebaser.filterEdits},
 * - drops the nested node changes and derived indexes (`nodeToParent`, `crossFieldKeys`) that become unreferenced,
 * - drops any build whose nodes are entirely unused, and splits any partially-used build so that only the runs of used
 * nodes are retained, and
 * - trims transient content nested within a surviving node's build tree.
 *
 * The result applies to produce the same document as the input change.
 *
 * @param change - The change to minimize. Not mutated by this function.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta and filtering transient effects.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	const builds = change.builds;
	if (builds === undefined || builds.size === 0) {
		return change;
	}

	assert(change.destroys === undefined, "No destroys expected in change to be minimized");

	const delta = intoDelta(makeAnonChange(change), fieldKinds);
	const globalById = indexGlobalById(delta);
	const renameGraph = buildRenameGraph(delta);

	// Compute the set of detached node IDs whose content ends up attached in the resulting document. Content built by
	// this change but absent from this set has no observable effect and is treated as "dead" / trimmable below.
	const attached = collectAttachedDetachedNodeIds(delta, globalById, renameGraph);
	const isLive = (id: ChangeAtomId): boolean =>
		detachedNodeIdSetHas(attached, id.revision, id.localId);

	// Compute the set of "dead" node IDs: IDs (build cells, move ids, and detach output cells) that refer to content
	// which is built by this change but does not survive it. Field-level effects targeting these IDs are removed.
	const dead = computeDeadIds(builds, renameGraph, attached);
	const isDead = (id: ChangeAtomId): boolean =>
		detachedNodeIdSetHas(dead, id.revision, id.localId);

	// Compute the destinations of detaches that remove content built inline within a surviving node's build tree.
	// Such content is trimmed out of the build, so the field change detaching it must treat its input as already empty.
	const trimmedInputDetaches = computeTrimmedInputDetaches(builds, globalById, isLive);
	const isTrimmedInputDetach = (id: ChangeAtomId): boolean =>
		detachedNodeIdSetHas(trimmedInputDetaches, id.revision, id.localId);

	const minimizer = new ModularChangeEditMinimizer(
		change,
		fieldKinds,
		isDead,
		isTrimmedInputDetach,
	);

	const minimizedChange: Mutable<ModularChangeset> = minimizer.minimizeEdits();

	const minimizedBuilds = computeMinimizedBuilds(builds, globalById, isLive);
	if (minimizedBuilds.size > 0) {
		minimizedChange.builds = minimizedBuilds;
	} else {
		delete minimizedChange.builds;
	}

	return minimizedChange;
}

function getBuiltNodeIds(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ChangeAtomIdBTree<boolean> {
	const builtNodeIds = newChangeAtomIdBTree<boolean>();

	const buildIds = newChangeAtomIdRangeMap<boolean>();
	if (change.builds !== undefined) {
		for (const [rootId, chunk] of change.builds.entries()) {
			buildIds.set(makeChangeAtomId(rootId[1], rootId[0]), chunk.topLevelLength, true);
		}
	}

	addBuiltNodeIdsForFields(
		false,
		change.fieldChanges,
		change.nodeChanges,
		buildIds,
		fieldKinds,
		builtNodeIds,
	);
	return builtNodeIds;
}

function addBuiltNodeIdsForFields(
	parentIsBuilt: boolean,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	buildIds: ChangeAtomIdRangeMap<boolean>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	builtNodeIds: ChangeAtomIdBTree<boolean>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const { nodeId, inputDetachedId: inputId } of children) {
			const isPartOfBuild =
				parentIsBuilt ||
				(inputId !== undefined && buildIds.getFirst(inputId, 1).value === true);

			if (isPartOfBuild) {
				builtNodeIds.set([nodeId.revision, nodeId.localId], true);
			}

			const nodeChangeset = nodeChangeFromId(nodes, nodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addBuiltNodeIdsForFields(
					isPartOfBuild,
					nodeChangeset.fieldChanges,
					nodes,
					buildIds,
					fieldKinds,
					builtNodeIds,
				);
			}
		}
	}
}

function getOutputNodeAttachStates(
	family: ModularChangeFamily,
	change: ModularChangeset,
): ChangeAtomIdBTree<NodeAttachState> {
	const inverse = family.invert(makeAnonChange(change), true, "root");
	return getInputNodeAttachStates(inverse, family.fieldKinds);
}

function getInputNodeAttachStates(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ChangeAtomIdBTree<NodeAttachState> {
	const nodeAttachStates = newChangeAtomIdBTree<NodeAttachState>();
	addInputNodeAttachStatesForFields(
		NodeAttachState.Attached,
		change.fieldChanges,
		change.nodeChanges,
		fieldKinds,
		nodeAttachStates,
	);
	return nodeAttachStates;
}

function addInputNodeAttachStatesForFields(
	parentState: NodeAttachState,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	nodeAttachStates: ChangeAtomIdBTree<NodeAttachState>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const { nodeId, inputDetachedId } of children) {
			const attachState =
				parentState === NodeAttachState.Attached && inputDetachedId === undefined
					? NodeAttachState.Attached
					: NodeAttachState.Detached;

			nodeAttachStates.set([nodeId.revision, nodeId.localId], attachState);

			const nodeChangeset = nodeChangeFromId(nodes, nodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addInputNodeAttachStatesForFields(
					attachState,
					nodeChangeset.fieldChanges,
					nodes,
					fieldKinds,
					nodeAttachStates,
				);
			}
		}
	}
}
