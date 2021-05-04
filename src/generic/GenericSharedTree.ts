/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from '@fluidframework/common-utils';
import { IFluidHandle, IFluidSerializer } from '@fluidframework/core-interfaces';
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from '@fluidframework/protocol-definitions';
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelAttributes,
} from '@fluidframework/datastore-definitions';
import { AttachState } from '@fluidframework/container-definitions';
import { SharedObject } from '@fluidframework/shared-object-base';
import { IErrorEvent, ITelemetryLogger } from '@fluidframework/common-definitions';
import { ChildLogger, PerformanceEvent } from '@fluidframework/telemetry-utils';
import { assert, assertNotUndefined, fail, SharedTreeTelemetryProperties } from '../Common';
import { editsPerChunk, EditLog, OrderedEditSet } from '../EditLog';
import { EditId } from '../Identifiers';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';
import { CachingLogViewer, LogViewer } from '../LogViewer';
import { convertSummaryToReadFormat, deserialize, readFormatVersion } from '../SummaryBackCompatibility';
import {
	SharedTreeSummarizer,
	serialize,
	SharedTreeSummary,
	fullHistorySummarizer,
	SharedTreeSummaryBase,
} from './Summary';
import { Edit, SharedTreeOpType, SharedTreeEditOp, SharedTreeHandleOp, EditWithoutId } from './PersistedTypes';
import { GenericTransaction } from './GenericTransaction';
import { newEdit } from './GenericEditUtilities';

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = 'header';

const initialSummary: SharedTreeSummary<unknown> = {
	version: readFormatVersion,
	currentTree: initialTree,
	editHistory: {
		editChunks: [],
		editIds: [],
	},
};

/**
 * An event emitted by a `SharedTree` to indicate a state change. See {@link ISharedTreeEvents} for event argument information.
 * @public
 */
export enum SharedTreeEvent {
	/**
	 * An edit has been committed to the log.
	 * This happens when either:
	 * 	1. A locally generated edit is added to the log.
	 * 	2. A remotely generated edit is added to the log.
	 * Note that, for locally generated edits, this event will not be emitted again when that edit is sequenced.
	 * Passed the EditId of the committed edit, i.e. supports callbacks of type {@link EditCommittedHandler}.
	 */
	EditCommitted = 'committedEdit',
}

/**
 * The arguments included when the EditCommitted SharedTreeEvent is emitted.
 * @public
 */
export interface EditCommittedEventArguments<TSharedTree> {
	/** The ID of the edit committed. */
	editId: EditId;
	/** Whether or not this is a local edit. */
	local: boolean;
	/** The tree the edit was committed on. Required for local edit events handled by SharedTreeUndoRedoHandler. */
	tree: TSharedTree;
}

/**
 * Events which may be emitted by `SharedTree`. See {@link SharedTreeEvent} for documentation of event semantics.
 */
export interface ISharedTreeEvents<TSharedTree> extends IErrorEvent {
	(event: 'committedEdit', listener: EditCommittedHandler<TSharedTree>);
}

/**
 * Expected type for a handler of the `EditCommitted` event.
 */
export type EditCommittedHandler<TSharedTree> = (args: EditCommittedEventArguments<TSharedTree>) => void;

const sharedTreeTelemetryProperties: SharedTreeTelemetryProperties = { isSharedTreeEvent: true };

/**
 * A distributed tree.
 * @public
 * @sealed
 */
export class GenericSharedTree<TChange> extends SharedObject<ISharedTreeEvents<TChange>> {
	/**
	 * Handler for summary generation.
	 * See 'SharedTreeSummarizer' for details.
	 */
	public summarizer: SharedTreeSummarizer<TChange> = fullHistorySummarizer;

	/**
	 * The log of completed edits for this SharedTree.
	 */
	private editLog: EditLog<TChange>;

	/**
	 * As an implementation detail, SharedTree uses a log viewer that caches snapshots at different revisions.
	 * It is not exposed to avoid accidental correctness issues, but `logViewer` is exposed in order to give clients a way
	 * to access the revision history.
	 */
	private cachingLogViewer: CachingLogViewer<TChange>;

	/**
	 * Viewer for trees defined by editLog. This allows access to views of the tree at different revisions (various points in time).
	 */
	public get logViewer(): LogViewer {
		return this.cachingLogViewer;
	}

	protected readonly logger: ITelemetryLogger;

	/**
	 * Iff true, additional assertions for correctness in CachingLogViewer will run.
	 */
	private readonly expensiveValidation: boolean;

	public readonly transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>;

	/**
	 * Create a new SharedTreeFactory.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param expensiveValidation - enable expensive asserts
	 */
	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>,
		attributes: IChannelAttributes,
		expensiveValidation = false
	) {
		super(id, runtime, attributes);
		this.expensiveValidation = expensiveValidation;
		this.transactionFactory = transactionFactory;

		this.logger = ChildLogger.create(runtime.logger, 'SharedTree', sharedTreeTelemetryProperties);
		const { editLog, cachingLogViewer } = this.createEditLogFromSummary(initialSummary);

		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;
	}

	/**
	 * @returns the current view of the tree.
	 */
	public get currentView(): Snapshot {
		return this.logViewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
	}

	/**
	 * @returns the edit history of the tree.
	 */
	public get edits(): OrderedEditSet<TChange> {
		return this.editLog;
	}

	/**
	 * Convenience helper for applying an edit containing the given changes.
	 * Opens an edit, applies the given changes, and closes the edit. See (`openEdit()`/`applyChanges()`/`closeEdit()`).
	 *
	 * For convenient imperative variants of edits, see `editor`.
	 * @internal
	 */
	public applyEdit(...changes: TChange[]): EditId {
		const edit = newEdit(changes);
		this.processLocalEdit(edit);
		return edit.id;
	}

	private deserializeHandle(serializedHandle: string): IFluidHandle<ArrayBufferLike> {
		const deserializeHandle = this.serializer.parse(serializedHandle);
		assert(typeof deserializeHandle === 'object');
		return deserializeHandle as IFluidHandle<ArrayBufferLike>;
	}

	/**
	 * Uploads the edit chunk and sends the chunk key along with the resulting handle as an op.
	 */
	private async uploadEditChunk(edits: EditWithoutId<TChange>[], chunkKey: number): Promise<void> {
		// TODO:#49901: Enable writing of edit chunk blobs to summary
		// const editHandle = await this.runtime.uploadBlob(IsoBuffer.from(JSON.stringify({ edits })));
		// this.submitLocalMessage({
		// 	editHandle: serializeHandles(editHandle, this.serializer, this.handle),
		// 	chunkKey,
		// 	type: SharedTreeOpType.Handle,
		// });
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshotCore}
	 */
	public snapshotCore(serializer: IFluidSerializer): ITree {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: snapshotFileName,
					type: TreeEntry[TreeEntry.Blob],
					value: {
						contents: this.saveSerializedSummary(serializer),
						encoding: 'utf-8',
					},
				},
			],
		};

		return tree;
	}

	/**
	 * Saves this SharedTree into a serialized summary.
	 *
	 * @param serializer - Optional serializer to use. If not passed in, SharedTree's serializer is used.
	 * @internal
	 */
	public saveSerializedSummary(serializer?: IFluidSerializer): string {
		return serialize(this.saveSummary(), serializer || this.serializer, this.handle);
	}

	/**
	 * Saves this SharedTree into a summary.
	 * @internal
	 */
	public saveSummary(): SharedTreeSummaryBase {
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

		return this.summarizer(this.editLog, this.currentView);
	}

	/**
	 * Initialize shared tree with a summary.
	 * @internal
	 */
	public loadSummary(summary: SharedTreeSummaryBase): void {
		const { editLog, cachingLogViewer } = this.createEditLogFromSummary(summary);
		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;
	}

	private createEditLogFromSummary(
		summary: SharedTreeSummaryBase
	): { editLog: EditLog<TChange>; cachingLogViewer: CachingLogViewer<TChange> } {
		const convertedSummary = convertSummaryToReadFormat<TChange>(summary);
		if (typeof convertedSummary === 'string') {
			fail(convertedSummary);
		}
		const { editHistory, currentTree } = convertedSummary;
		const currentView = Snapshot.fromTree(currentTree);

		const editLog = new EditLog(editHistory);
		const logViewer = new CachingLogViewer(
			editLog,
			initialTree,
			// TODO:#47830: Store multiple checkpoints in summary.
			[[editLog.length, currentView]],
			this.expensiveValidation,
			undefined,
			this.logger,
			this.transactionFactory,
			0
		);

		// Upload any full blobs that have yet to be uploaded
		// When multiple clients connect and load summaries with non-uploaded chunks, they will all initiate uploads
		// but there will only be one winner per chunk.
		for (const [key, chunk] of editLog.getEditChunksReadyForUpload()) {
			this.uploadEditChunk(chunk, key).catch((error: unknown) => this.emit('error', error));
		}

		return { editLog, cachingLogViewer: logViewer };
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
	public equals<TOtherChangeTypes>(sharedTree: GenericSharedTree<TOtherChangeTypes>): boolean {
		if (!this.currentView.equals(sharedTree.currentView)) {
			return false;
		}

		return this.editLog.equals(sharedTree.editLog);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const summaryLoadPerformanceEvent = PerformanceEvent.start(this.logger, { eventName: 'SummaryLoad' });

		try {
			const newBlob = await storage.readBlob(snapshotFileName);
			const blobData = bufferToString(newBlob, 'utf8');

			const summary = deserialize(blobData, this.serializer);
			if (typeof summary === 'string') {
				fail(summary);
			}
			this.loadSummary(summary);

			summaryLoadPerformanceEvent.end({ historySize: this.edits.length });
		} catch (error) {
			summaryLoadPerformanceEvent.cancel(undefined, error);
			throw error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: ISequencedDocumentMessage, local: boolean): void {
		this.cachingLogViewer.setMinimumSequenceNumber(message.minimumSequenceNumber);
		const { type } = message.contents;
		if (type === SharedTreeOpType.Handle) {
			const { editHandle, chunkKey } = message.contents as SharedTreeHandleOp;
			this.editLog.processEditChunkHandle(this.deserializeHandle(editHandle), chunkKey);
		} else if (type === SharedTreeOpType.Edit) {
			const semiSerializedEdit = message.contents.edit;
			// semiSerializedEdit may have handles which have been replaced by `serializer.replaceHandles`.
			// Since there is no API to un-replace them except via parse, re-stringify the edit, then parse it.
			// Stringify using JSON, not IFluidSerializer since OPs use JSON directly.
			// TODO:Performance:#48025: Avoid this serialization round trip.
			const stringEdit = JSON.stringify(semiSerializedEdit);
			const parsedEdit = this.serializer.parse(stringEdit);
			const edit = parsedEdit as Edit<TChange>;
			this.processSequencedEdit(edit);
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

	private processSequencedEdit(edit: Edit<TChange>): void {
		const { id: editId } = edit;
		const wasLocalEdit = this.editLog.isLocalEdit(editId);

		// If the id of the supplied edit matches a nonlocal edit already present in the log, this would normally be indicative of an error.
		// However, the @fluidframework packages prior to 0.37.x have a bug which can cause data corruption by sequencing duplicate edits--
		// see discussion on the following github issue: https://github.com/microsoft/FluidFramework/issues/4399
		// To work around this issue, we currently tolerate duplicate ops in loaded documents.
		// This could be strengthened in the future to only apply to documents which may have been impacted.
		const shouldIgnoreEdit = this.editLog.tryGetIndexOfId(editId) !== undefined && !wasLocalEdit;
		if (shouldIgnoreEdit) {
			return;
		}

		this.editLog.addSequencedEdit(edit);
		if (!wasLocalEdit) {
			const eventArguments: EditCommittedEventArguments<GenericSharedTree<TChange>> = {
				editId,
				local: false,
				tree: this,
			};
			this.emit(SharedTreeEvent.EditCommitted, eventArguments);
		} else {
			// If this client created the edit that filled up a chunk, it is responsible for uploading that chunk.
			const lastPair = this.editLog.getLastEditChunk();
			if (lastPair !== undefined) {
				const [key, chunk] = lastPair;
				const edits = assertNotUndefined(chunk.edits);
				if (edits.length === editsPerChunk) {
					this.uploadEditChunk(edits, key).catch((error: unknown) => this.emit('error', error));
				}
			}
		}
	}

	/**
	 * Add an `Edit` directly.
	 * External users should use one of the more specialized functions, like applyEdit which handles constructing the actual `Edit` object.
	 * This is exposed as it is useful for testing, particularly with invalid and malformed Edits.
	 * @internal
	 */
	public processLocalEdit(edit: Edit<TChange>): void {
		const editOp: SharedTreeEditOp<TChange> = {
			type: SharedTreeOpType.Edit,
			edit,
		};

		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles before sending:
		const semiSerialized = this.serializer.replaceHandles(editOp, this.handle);

		// TODO:44711: what should be passed in when unattached?
		this.submitLocalMessage(semiSerialized);
		this.editLog.addLocalEdit(edit);

		const eventArguments: EditCommittedEventArguments<GenericSharedTree<TChange>> = {
			editId: edit.id,
			local: true,
			tree: this,
		};
		this.emit(SharedTreeEvent.EditCommitted, eventArguments);
	}

	public getRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}
}
