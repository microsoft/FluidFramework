/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from '@fluidframework/common-utils';
import { IFluidHandle, IFluidSerializer, ISerializedHandle } from '@fluidframework/core-interfaces';
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from '@fluidframework/protocol-definitions';
import { IFluidDataStoreRuntime, IChannelStorageService } from '@fluidframework/datastore-definitions';
import { AttachState } from '@fluidframework/container-definitions';
import { SharedObject } from '@fluidframework/shared-object-base';
import { assert, assertNotUndefined, fail } from './Common';
import { EditLog, OrderedEditSet } from './EditLog';
import {
	Edit,
	Delete,
	Change,
	EditNode,
	Insert,
	Move,
	ChangeNode,
	StableRange,
	StablePlace,
	Payload,
} from './PersistedTypes';
import { newEdit } from './EditUtilities';
import { EditId } from './Identifiers';
import { SharedTreeFactory } from './Factory';
import { Snapshot } from './Snapshot';
import {
	SharedTreeSummarizer,
	formatVersion,
	serialize,
	SharedTreeSummary,
	fullHistorySummarizer,
	deserialize,
} from './Summary';
import * as HistoryEditFactory from './HistoryEditFactory';
import { initialTree } from './InitialTree';
import { CachingLogViewer, LogViewer } from './LogViewer';
import { transpileSummaryToReadFormat } from './SummaryBackCompatibility';

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = 'header';

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
export type ErrorString = string;

const initialSummary: SharedTreeSummary = {
	version: formatVersion,
	currentTree: initialTree,
	sequencedEdits: [],
};

/**
 * An event emitted by a `SharedTree` to indicate a state change
 * @public
 */
export enum SharedTreeEvent {
	/**
	 * An edit has been committed to the log.
	 * This happens when either:
	 * 	1. A locally generated edit is added to the log.
	 * 	2. A remotely generated edit is added to the log.
	 * Note that, for locally generated edits, this event will not be emitted again when that edit is sequenced.
	 * Passed the EditId of the committed edit.
	 */
	EditCommitted = 'committedEdit',

	/**
	 * A group of edits has been
	 */
	EditsBlobbed = 'blobbedEdits',
}

/**
 * TODO:#48151: Support reference payloads, and use this type to identify them.
 */
export type BlobId = string;

/**
 * Wrapper around a `SharedTree` which provides ergonomic imperative editing functionality. All methods apply changes in their own edit.
 *
 * @example
 * // The following two lines of code are equivalent:
 * tree.applyEdit(...Insert.create([newNode], StablePlace.before(existingNode)));
 * tree.editor.insert(newNode, StablePlace.before(existingNode))
 * @public
 */
export class SharedTreeEditor {
	private readonly tree: SharedTree;

	public constructor(tree: SharedTree) {
		this.tree = tree;
	}

	/**
	 * Inserts a node at a location.
	 * @param node - Node to insert.
	 * @param destination - StablePlace at which the insert should take place.
	 */
	public insert(node: EditNode, destination: StablePlace): EditId;
	/**
	 * Inserts nodes at a location.
	 * @param nodes - Nodes to insert.
	 * @param destination - StablePlace at which the insert should take place.
	 */
	public insert(nodes: EditNode[], destination: StablePlace): EditId;
	public insert(nodeOrNodes: EditNode | EditNode[], destination: StablePlace): EditId {
		return this.tree.applyEdit(
			...Insert.create(Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes], destination)
		);
	}

	/**
	 * Moves a node to a specified location.
	 * @param source - Node to move.
	 * @param destination - StablePlace to which the node should be moved.
	 */
	public move(source: ChangeNode, destination: StablePlace): EditId;
	/**
	 * Moves a part of a trait to a specified location.
	 * @param source - Portion of a trait to move.
	 * @param destination - StablePlace to which the portion of the trait should be moved.
	 */
	public move(source: StableRange, destination: StablePlace): EditId;
	public move(source: ChangeNode | StableRange, destination: StablePlace): EditId {
		if (this.isNode(source)) {
			return this.tree.applyEdit(...Move.create(StableRange.only(source), destination));
		}

		return this.tree.applyEdit(...Move.create(source, destination));
	}

	/**
	 * Deletes a node.
	 * @param target - Node to delete
	 */
	public delete(target: ChangeNode): EditId;
	/**
	 * Deletes a portion of a trait.
	 * @param target - Range of nodes to delete, specified as a `StableRange`
	 */
	public delete(target: StableRange): EditId;
	public delete(target: ChangeNode | StableRange): EditId {
		if (this.isNode(target)) {
			return this.tree.applyEdit(Delete.create(StableRange.only(target)));
		}

		return this.tree.applyEdit(Delete.create(target));
	}

	/**
	 * Reverts a previous edit.
	 * @param edit - ID of the edit to revert
	 */
	public async revert(edit: EditId): Promise<EditId> {
		return this.tree.applyEdit(...(await this.tree.createRevert(edit)));
	}

	private isNode(source: ChangeNode | StableRange): source is ChangeNode {
		return (source as ChangeNode).definition !== undefined && (source as ChangeNode).identifier !== undefined;
	}
}

/**
 * A distributed tree.
 * @public
 * @sealed
 */
export class SharedTree extends SharedObject {
	/**
	 * Create a new SharedTree. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTree {
		return runtime.createChannel(id, SharedTreeFactory.Type) as SharedTree;
	}

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @returns A factory that creates SharedTrees and loads them from storage.
	 */
	public static getFactory(): SharedTreeFactory {
		return new SharedTreeFactory();
	}

	/**
	 * Handler for summary generation.
	 * See 'SharedTreeSummarizer' for details.
	 */
	public summarizer: SharedTreeSummarizer = fullHistorySummarizer;

	/**
	 * The log of completed edits for this SharedTree.
	 */
	private editLog: EditLog;

	/**
	 * Viewer for trees defined by editLog.
	 * @internal
	 */
	public logViewer: LogViewer;

	/**
	 * TODO:#48151: Cache of downloaded reference payloads
	 * @internal
	 */
	public payloadCache: Map<BlobId, Payload> = new Map();

	/**
	 * Iff true, the snapshots passed to setKnownRevision will be asserted to be correct.
	 */
	private readonly expensiveValidation: boolean;

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param expensiveValidation - enable expensive asserts
	 */
	public constructor(runtime: IFluidDataStoreRuntime, id: string, expensiveValidation = false) {
		super(id, runtime, SharedTreeFactory.Attributes);
		this.expensiveValidation = expensiveValidation;
		const { editLog, logViewer } = this.createEditLogFromSummary(initialSummary, this.expensiveValidation);
		this.editLog = editLog;
		this.logViewer = logViewer;
	}

	/**
	 * @returns the current view of the tree.
	 */
	public get currentView(): Snapshot {
		return this.logViewer.getSnapshotSynchronous(Number.POSITIVE_INFINITY);
	}

	/**
	 * @returns the edit history of the tree.
	 */
	public get edits(): OrderedEditSet {
		return this.editLog;
	}

	private _editor: SharedTreeEditor | undefined;

	/**
	 * Returns a `SharedTreeEditor` for editing this tree in an imperative fashion. All edits are performed on the current tree view.
	 */
	public get editor(): SharedTreeEditor {
		if (!this._editor) {
			this._editor = new SharedTreeEditor(this);
		}

		return this._editor;
	}

	/**
	 * Convenience helper for applying an edit containing the given changes.
	 * Opens an edit, applies the given changes, and closes the edit. See (`openEdit()`/`applyChanges()`/`closeEdit()`).
	 *
	 * For convenient imperative variants of edits, see `editor`.
	 * @internal
	 */
	public applyEdit(...changes: Change[]): EditId {
		const [id, edit] = newEdit(changes);
		this.processLocalEdit(id, edit);
		return id;
	}

	/**
	 * @returns Changes reverting the specified edit.
	 */
	public async createRevert(editId: EditId): Promise<Change[]> {
		const edit = (await this.editLog.tryGetEdit(editId)) ?? fail('Edit must exist in the edit log to be reverted.');
		// Get the revision to which edit is applied (This is not the output of applying edit: it's the one just before that).
		const revision = await this.logViewer.getSnapshot(this.editLog.indexOf(editId));
		return HistoryEditFactory.revert(edit, revision);
	}

	/**
	 * @returns Changes reverting the specified edit. Must only be used to revert an edit added during the current session.
	 */
	public createRevertSynchronous(editId: EditId): Change[] {
		const edit =
			this.editLog.getAtIndexSynchronous(this.editLog.indexOf(editId)) ??
			fail('Edit must exist in the edit log to be reverted.');
		// Get the revision to which edit is applied (This is not the output of applying edit: it's the one just before that).
		const revision = this.logViewer.getSnapshotSynchronous(this.editLog.indexOf(editId));
		return HistoryEditFactory.revert(edit, revision);
	}

	private deserializeHandle(serializedHandle: ISerializedHandle): IFluidHandle<ArrayBufferLike> {
		return this.serializer.parse(JSON.stringify(serializedHandle));
	}

	private toSerializable(value: IFluidHandle<ArrayBufferLike>): ISerializedHandle {
		// Stringify to convert to the serialized handle values - and then parse
		const stringified = this.serializer.stringify(value, this.handle);
		return JSON.parse(stringified);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshotCore}
	 */
	public snapshotCore(_serializer: IFluidSerializer): ITree {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: snapshotFileName,
					type: TreeEntry[TreeEntry.Blob],
					value: {
						contents: serialize(this.saveSummary()),
						encoding: 'utf-8',
					},
				},
			],
			id: null,
		};

		return tree;
	}

	/**
	 * Saves this SharedTree into a summary.
	 * @internal
	 */
	public saveSummary(): SharedTreeSummary {
		if (this.editLog.length === 0) {
			return initialSummary;
		}

		// If local changes exist, emulate the sequencing of those changes.
		// Doing so is necessary so edits created during DataObject.initializingFirstTime are included.
		// Doing so is safe because it is guaranteed that the DDS has not yet been attached. This is because summary creation is only
		// ever invoked on a DataObject containing local changes when it is attached for the first time. In post-attach flows, an extra
		// instance of the DataObject is created for generating summaries and will never have local edits.
		if (this.editLog.numberOfLocalEdits > 0) {
			assert(
				this.runtime.attachState !== AttachState.Attached,
				'Summarizing should not occur with local edits except on first attach.'
			);
			this.editLog.sequenceLocalEdits();
		}

		return this.summarizer(this.editLog, this.currentView, { serializeHandle: this.toSerializable.bind(this) });
	}

	/**
	 * Initialize shared tree with a summary.
	 * @internal
	 */
	public loadSummary(summary: SharedTreeSummary): void {
		const { editLog, logViewer } = this.createEditLogFromSummary(summary, this.expensiveValidation);
		this.editLog = editLog;
		this.logViewer = logViewer;
	}

	private createEditLogFromSummary(
		summary: SharedTreeSummary,
		expensiveValidation: boolean
	): { editLog: EditLog; logViewer: LogViewer } {
		const transpiledSummary = transpileSummaryToReadFormat(summary);
		if (typeof transpiledSummary === 'string') {
			fail(transpiledSummary); // TODO: Where does this error propagate?
		}
		const { editHistory, currentTree } = transpiledSummary;
		const { editChunks, editIds } = assertNotUndefined(
			editHistory,
			'Transpiling should result in editChunks being populated.'
		);
		const currentView = Snapshot.fromTree(currentTree);

		const editLogOptions = {
			editChunks: assertNotUndefined(editChunks).map((chunk) => {
				if (Array.isArray(chunk)) {
					return chunk;
				}

				return this.deserializeHandle(chunk);
			}),
			editIds,
		};
		const editLog = new EditLog(editLogOptions);
		const logViewer = new CachingLogViewer(editLog, initialTree, expensiveValidation);

		// TODO:#47830: Store the associated revision on the snapshot.
		// The current view should only be stored in the cache if the revision it's associated with is known.
		logViewer.setKnownRevision(editLog.length, currentView);
		return { editLog, logViewer };
	}

	/**
	 * Compares this shared tree to another for equality.
	 *
	 * Equality means that the histories as captured by the EditLogs are equal.
	 *
	 * Equality does not include:
	 *   - if an edit is open
	 *   - the shared tree's id
	 *   - local vs sequenced status of edits
	 *   - registered event listeners
	 *   - state of caches
	 * */
	public equals(sharedTree: SharedTree): boolean {
		if (!this.currentView.equals(sharedTree.currentView)) {
			return false;
		}

		return this.editLog.equals(sharedTree.editLog);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const header = await storage.read(snapshotFileName);
		const summary = deserialize(fromBase64ToUtf8(header));
		if (typeof summary === 'string') {
			fail(summary); // TODO: Where does this error propagate?
		}
		this.loadSummary(summary);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: ISequencedDocumentMessage, local: boolean): void {
		const operation = message.contents;
		if (operation.type === 'handle') {
			this.editLog.processEditChunkHandle(this.deserializeHandle(operation.editHandle), operation.chunkIndex);
		} else {
			const { id, edit } = message.contents;
			this.processSequencedEdit(id, edit);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
	 */
	protected registerCore(): void {
		// Do nothing
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {
		// Do nothing
	}

	private processSequencedEdit(id: EditId, edit: Edit): void {
		const wasLocalEdit = this.editLog.isLocalEdit(id);
		this.editLog.addSequencedEdit(id, edit);
		if (!wasLocalEdit) {
			this.emit(SharedTreeEvent.EditCommitted, id);
		}
	}

	/**
	 * Add an `Edit` directly.
	 * External users should use one of the more specialized functions, like applyEdit which handles constructing the actual `Edit` object.
	 * This is exposed as it is useful for testing, particularly with invalid and malformed Edits.
	 * @internal
	 */
	public processLocalEdit(id: EditId, edit: Edit): void {
		// TODO:44711: what should be passed in when unattached?
		this.submitLocalMessage({ edit, id, type: 'edit' });
		this.editLog.addLocalEdit(id, edit);
		this.emit(SharedTreeEvent.EditCommitted, id);
	}
}
