/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from '@fluidframework/common-utils';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelFactory,
	IChannelAttributes,
	IChannelServices,
	IChannel,
} from '@fluidframework/datastore-definitions';
import { AttachState } from '@fluidframework/container-definitions';
import {
	createSingleBlobSummary,
	IFluidSerializer,
	ISharedObjectEvents,
	serializeHandles,
	SharedObject,
} from '@fluidframework/shared-object-base';
import { ITelemetryLogger, ITelemetryProperties } from '@fluidframework/common-definitions';
import { ChildLogger, ITelemetryLoggerPropertyBags, PerformanceEvent } from '@fluidframework/telemetry-utils';
import { ISummaryTreeWithStats } from '@fluidframework/runtime-definitions';
import { assert, assertNotUndefined, fail, copyPropertyIfDefined } from './Common';
import { EditHandle, EditLog, getNumberOfHandlesFromEditLogSummary, OrderedEditSet } from './EditLog';
import {
	EditId,
	NodeId,
	StableNodeId,
	DetachedSequenceId,
	OpSpaceNodeId,
	isDetachedSequenceId,
	AttributionId,
} from './Identifiers';
import { initialTree } from './InitialTree';
import {
	CachingLogViewer,
	EditCacheEntry,
	EditStatusCallback,
	LogViewer,
	SequencedEditResult,
	SequencedEditResultCallback,
} from './LogViewer';
import { deserialize, getSummaryStatistics } from './SummaryBackCompatibility';
import { ReconciliationPath } from './ReconciliationPath';
import {
	BuildNodeInternal,
	ChangeInternal,
	ChangeNode,
	ChangeTypeInternal,
	ConstraintInternal,
	DetachInternal,
	Edit,
	EditLogSummary,
	EditChunkContents,
	EditStatus,
	EditWithoutId,
	reservedIdCount,
	SharedTreeEditOp,
	SharedTreeEditOp_0_0_2,
	SharedTreeHandleOp,
	SharedTreeNoOp,
	SharedTreeOp,
	SharedTreeOpType,
	SharedTreeOp_0_0_2,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	TreeNode,
	ghostSessionId,
	WriteFormat,
	TreeNodeSequence,
	InternalizedChange,
} from './persisted-types';
import { serialize, SummaryContents } from './Summary';
import {
	areRevisionViewsSemanticallyEqual,
	convertTreeNodes,
	deepCloneStablePlace,
	deepCloneStableRange,
	internalizeBuildNode,
	newEditId,
	walkTree,
} from './EditUtilities';
import { getNodeIdContext, NodeIdContext, NodeIdNormalizer, sequencedIdNormalizer } from './NodeIdUtilities';
import { SharedTreeDiagnosticEvent, SharedTreeEvent } from './EventTypes';
import { RevisionView } from './RevisionView';
import { SharedTreeEncoder_0_0_2, SharedTreeEncoder_0_1_1 } from './SharedTreeEncoder';
import { revert } from './HistoryEditFactory';
import { BuildNode, BuildTreeNode, Change, ChangeType } from './ChangeTypes';
import { TransactionInternal } from './TransactionInternal';
import { IdCompressor, createSessionId } from './id-compressor';
import { convertEditIds } from './IdConversion';
import { MutableStringInterner } from './StringInterner';
import { nilUuid } from './UuidUtilities';

/**
 * The write format and associated options used to construct a `SharedTree`
 * @public
 */
export type SharedTreeArgs<WF extends WriteFormat = WriteFormat> = [writeFormat: WF, options?: SharedTreeOptions<WF>];

/**
 * The type of shared tree options for a given write format
 * @public
 */
export type SharedTreeOptions<
	WF extends WriteFormat,
	HistoryCompatibility extends 'Forwards' | 'None' = 'Forwards'
> = Omit<
	WF extends WriteFormat.v0_0_2
		? SharedTreeOptions_0_0_2
		: WF extends WriteFormat.v0_1_1
		? SharedTreeOptions_0_1_1
		: never,
	HistoryCompatibility extends 'Forwards' ? 'summarizeHistory' : never
>;

/**
 * Configuration options for a SharedTree with write format 0.0.2
 * @public
 */
export interface SharedTreeOptions_0_0_2 {
	/**
	 * Determines if the history is included in summaries.
	 *
	 * Warning: enabling history summarization incurs a permanent cost in the document. It is not possible to disable history summarization
	 * later once it has been enabled, and thus the history cannot be safely deleted.
	 *
	 * On 0.1.1 documents, due to current code limitations, this parameter is only impactful for newly created documents.
	 * `SharedTree`s which load existing documents will summarize history if and only if the loaded summary included history.
	 *
	 * The technical limitations here relate to clients with mixed versions collaborating.
	 * In the future we may allow modification of whether or not a particular document saves history, but only via a consensus mechanism.
	 * See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
	 * See docs/Breaking-Change-Migration for more details on the consensus scheme.
	 */
	summarizeHistory?: boolean;
}

/**
 * Configuration options for a SharedTree with write format 0.1.1
 * @public
 */
export interface SharedTreeOptions_0_1_1 {
	/**
	 * Determines if the history is included in summaries and if edit chunks are uploaded when they are full.
	 *
	 * Warning: enabling history summarization incurs a permanent cost in the document. It is not possible to disable history summarization
	 * later once it has been enabled, and thus the history cannot be safely deleted.
	 *
	 * On 0.1.1 documents, due to current code limitations, this parameter is only impactful for newly created documents.
	 * `SharedTree`s which load existing documents will summarize history if and only if the loaded summary included history.
	 *
	 * The technical limitations here relate to clients with mixed versions collaborating.
	 * In the future we may allow modification of whether or not a particular document saves history, but only via a consensus mechanism.
	 * See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
	 * See docs/Breaking-Change-Migration for more details on the consensus scheme.
	 */
	summarizeHistory?: false | { uploadEditChunks: boolean };
	/** a UUID that identifies the user of this tree; all node IDs generated by this tree will be associated with this UUID */
	attributionId?: AttributionId;
}

/**
 * Factory for SharedTree.
 * Includes history in the summary.
 * @public
 */
export class SharedTreeFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public static Type = 'SharedTree';

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public static Attributes: IChannelAttributes = {
		type: SharedTreeFactory.Type,
		snapshotFormatVersion: '0.1',
		packageVersion: '0.1',
	};

	private readonly args: SharedTreeArgs;

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in. See [the write format
	 * documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	constructor(...args: SharedTreeArgs<WriteFormat.v0_0_2>);
	constructor(...args: SharedTreeArgs<WriteFormat.v0_1_1>);
	constructor(...args: SharedTreeArgs) {
		this.args = args;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public get type(): string {
		return SharedTreeFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return SharedTreeFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		_channelAttributes: Readonly<IChannelAttributes>
	): Promise<IChannel> {
		const sharedTree = this.createSharedTree(runtime, id);
		await sharedTree.load(services);
		return sharedTree;
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - data store runtime that owns the new SharedTree
	 * @param id - optional name for the SharedTree
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const sharedTree = this.createSharedTree(runtime, id);
		sharedTree.initializeLocal();
		return sharedTree;
	}

	private createSharedTree(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const [writeFormat] = this.args;
		switch (writeFormat) {
			case WriteFormat.v0_0_2:
				return new SharedTree(runtime, id, ...(this.args as SharedTreeArgs<WriteFormat.v0_0_2>));
			case WriteFormat.v0_1_1:
				return new SharedTree(runtime, id, ...(this.args as SharedTreeArgs<WriteFormat.v0_1_1>));
			default:
				fail('Unknown write format');
		}
	}
}

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = 'header';

/**
 * Used for version comparison.
 */
const sortedWriteVersions = [WriteFormat.v0_0_2, WriteFormat.v0_1_1];

/**
 * The arguments included when the EditCommitted SharedTreeEvent is emitted.
 * @public
 */
export interface EditCommittedEventArguments {
	/** The ID of the edit committed. */
	readonly editId: EditId;
	/** Whether or not this is a local edit. */
	readonly local: boolean;
	/** The tree the edit was committed on. Required for local edit events handled by SharedTreeUndoRedoHandler. */
	readonly tree: SharedTree;
}

/**
 * The arguments included when the {@link SharedTreeEvent.SequencedEditApplied} SharedTreeEvent is emitted.
 * @public
 */
export interface SequencedEditAppliedEventArguments {
	/** The ID of the edit committed. */
	readonly edit: Edit<ChangeInternal>;
	/** Whether or not this was a local edit. */
	readonly wasLocal: boolean;
	/** The tree the edit was applied to. */
	readonly tree: SharedTree;
	/** The telemetry logger associated with sequenced edit application. */
	readonly logger: ITelemetryLogger;
	/** The reconciliation path for the edit. See {@link ReconciliationPath} for details. */
	readonly reconciliationPath: ReconciliationPath;
	/** The outcome of the sequenced edit being applied. */
	readonly outcome: EditApplicationOutcome;
}

/**
 * The outcome of an edit.
 * @public
 */
export type EditApplicationOutcome =
	| {
			/**
			 * The revision view resulting from the edit.
			 */
			readonly view: RevisionView;
			/**
			 * The status code for the edit that produced the revision.
			 */
			readonly status: EditStatus.Applied;
	  }
	| {
			/**
			 * The revision view resulting from the edit.
			 */
			readonly failure: TransactionInternal.Failure;
			/**
			 * The status code for the edit that produced the revision.
			 */
			readonly status: EditStatus.Invalid | EditStatus.Malformed;
	  };

/**
 * Events which may be emitted by `SharedTree`. See {@link SharedTreeEvent} for documentation of event semantics.
 * @public
 */
export interface ISharedTreeEvents extends ISharedObjectEvents {
	(event: 'committedEdit', listener: EditCommittedHandler);
	(event: 'appliedSequencedEdit', listener: SequencedEditAppliedHandler);
}

/**
 * Expected type for a handler of the `EditCommitted` event.
 * @public
 */
export type EditCommittedHandler = (args: EditCommittedEventArguments) => void;

/**
 * Expected type for a handler of the {@link SharedTreeEvent.SequencedEditApplied} event.
 * @public
 */
export type SequencedEditAppliedHandler = (args: SequencedEditAppliedEventArguments) => void;

const sharedTreeTelemetryProperties: ITelemetryLoggerPropertyBags = { all: { isSharedTreeEvent: true } };

/**
 * A [distributed tree](../Readme.md).
 * @public
 */
export class SharedTree extends SharedObject<ISharedTreeEvents> implements NodeIdContext {
	/**
	 * Create a new SharedTree. It will contain the default value (see initialTree).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedTree {
		return runtime.createChannel(id, SharedTreeFactory.Type) as SharedTree;
	}

	/**
	 * Get a factory for SharedTree to register with the data store.
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in.
	 * This format may be updated to a newer (supported) version at runtime if a collaborating shared-tree
	 * that was initialized with a newer write version connects to the session. Care must be taken when changing this value,
	 * as a staged rollout must of occurred such that all collaborating clients must have the code to read at least the version
	 * written.
	 * See [the write format documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 * @returns A factory that creates `SharedTree`s and loads them from storage.
	 */
	public static getFactory(...args: SharedTreeArgs<WriteFormat.v0_0_2>): SharedTreeFactory;

	public static getFactory(...args: SharedTreeArgs<WriteFormat.v0_1_1>): SharedTreeFactory;

	public static getFactory(...args: SharedTreeArgs): SharedTreeFactory {
		const [writeFormat] = args;
		// 	On 0.1.1 documents, due to current code limitations, all clients MUST agree on the value of `summarizeHistory`.
		//  Note that this means staged rollout changing this value should not be attempted.
		//  It is possible to update shared-tree to correctly handle such a staged rollout, but that hasn't been implemented.
		//  See the skipped test in SharedTreeFuzzTests.ts for more details on this issue.
		switch (writeFormat) {
			case WriteFormat.v0_0_2:
				return new SharedTreeFactory(...(args as SharedTreeArgs<WriteFormat.v0_0_2>));
			case WriteFormat.v0_1_1:
				return new SharedTreeFactory(...(args as SharedTreeArgs<WriteFormat.v0_1_1>));
			default:
				fail('Unknown write format');
		}
	}

	/**
	 * The UUID used for attribution of nodes created by this SharedTree. All shared trees with a write format of 0.1.1 or
	 * greater have a unique attribution ID which may be configured in the constructor. All other shared trees (i.e. those
	 * with a write format of 0.0.2) use the nil UUID as their attribution ID.
	 * @public
	 */
	public get attributionId(): AttributionId {
		switch (this.writeFormat) {
			case WriteFormat.v0_0_2:
				return nilUuid;
			default: {
				const { attributionId } = this.idCompressor;
				if (attributionId === ghostSessionId) {
					return nilUuid;
				}
				return attributionId;
			}
		}
	}

	private idCompressor: IdCompressor;
	private readonly idNormalizer: NodeIdNormalizer<OpSpaceNodeId> & { tree: SharedTree } = {
		tree: this,
		get localSessionId() {
			return this.tree.idCompressor.localSessionId;
		},
		normalizeToOpSpace: (id) => this.idCompressor.normalizeToOpSpace(id) as OpSpaceNodeId,
		normalizeToSessionSpace: (id, sessionId) => this.idCompressor.normalizeToSessionSpace(id, sessionId) as NodeId,
	};

	// The initial tree's definition isn't included in any op by default but it should still be interned. Including it here ensures that.
	private interner: MutableStringInterner = new MutableStringInterner([initialTree.definition]);

	/**
	 * The log of completed edits for this SharedTree.
	 */
	private editLog: EditLog<ChangeInternal>;

	/**
	 * As an implementation detail, SharedTree uses a log viewer that caches views of different revisions.
	 * It is not exposed to avoid accidental correctness issues, but `logViewer` is exposed in order to give clients a way
	 * to access the revision history.
	 */
	private cachingLogViewer: CachingLogViewer;

	/**
	 * Viewer for trees defined by editLog. This allows access to views of the tree at different revisions (various points in time).
	 */
	public get logViewer(): LogViewer {
		return this.cachingLogViewer;
	}

	protected readonly logger: ITelemetryLogger;
	private readonly sequencedEditAppliedLogger: ITelemetryLogger;

	private readonly encoder_0_0_2: SharedTreeEncoder_0_0_2;
	private encoder_0_1_1: SharedTreeEncoder_0_1_1;

	/** Indicates if the client is the oldest member of the quorum. */
	private currentIsOldest: boolean;

	private readonly processEditResult = (editResult: EditStatus, editId: EditId): void => {
		// TODO:#44859: Invalid results should be handled by the app
		this.emit(SharedTree.eventFromEditResult(editResult), editId);
	};

	private readonly processSequencedEditResult = ({
		edit,
		wasLocal,
		result,
		reconciliationPath,
	}: SequencedEditResult): void => {
		const eventArguments: SequencedEditAppliedEventArguments = {
			edit,
			wasLocal,
			tree: this,
			logger: this.sequencedEditAppliedLogger,
			reconciliationPath,
			outcome: result,
		};
		this.emit(SharedTreeEvent.SequencedEditApplied, eventArguments);
	};

	private summarizeHistory: boolean;
	private uploadEditChunks: boolean;

	private getHistoryPolicy(options: SharedTreeOptions<WriteFormat, 'Forwards' | 'None'>): {
		summarizeHistory: boolean;
		uploadEditChunks: boolean;
	} {
		const noCompatOptions = options as SharedTreeOptions<WriteFormat, 'None'>;
		if (typeof noCompatOptions.summarizeHistory === 'object') {
			return {
				summarizeHistory: true,
				uploadEditChunks: noCompatOptions.summarizeHistory.uploadEditChunks,
			};
		} else {
			return {
				summarizeHistory: noCompatOptions.summarizeHistory ?? false,
				uploadEditChunks: false,
			};
		}
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - The runtime the SharedTree will be associated with
	 * @param id - Unique ID for the SharedTree
	 * @param writeFormat - Determines the format version the SharedTree will write ops and summaries in. See [the write format
	 * documentation](../docs/Write-Format.md) for more information.
	 * @param options - Configuration options for this tree
	 */
	public constructor(runtime: IFluidDataStoreRuntime, id: string, ...args: SharedTreeArgs<WriteFormat.v0_0_2>);

	public constructor(runtime: IFluidDataStoreRuntime, id: string, ...args: SharedTreeArgs<WriteFormat.v0_1_1>);

	public constructor(
		runtime: IFluidDataStoreRuntime,
		id: string,
		private writeFormat: WriteFormat,
		options: SharedTreeOptions<typeof writeFormat> = {}
	) {
		super(id, runtime, SharedTreeFactory.Attributes);
		const historyPolicy = this.getHistoryPolicy(options);
		this.summarizeHistory = historyPolicy.summarizeHistory;
		this.uploadEditChunks = historyPolicy.uploadEditChunks;

		// This code is somewhat duplicated from OldestClientObserver because it currently depends on the container runtime
		// which SharedTree does not have access to.
		// TODO:#55900: Get rid of copy-pasted OldestClientObserver code
		const quorum = this.runtime.getQuorum();
		this.currentIsOldest = this.computeIsOldest();
		quorum.on('addMember', this.updateOldest);
		quorum.on('removeMember', this.updateOldest);
		runtime.on('connected', this.updateOldest);
		runtime.on('disconnected', this.updateOldest);

		this.logger = ChildLogger.create(runtime.logger, 'SharedTree', sharedTreeTelemetryProperties);
		this.sequencedEditAppliedLogger = ChildLogger.create(
			this.logger,
			'SequencedEditApplied',
			sharedTreeTelemetryProperties
		);

		const attributionId = (options as SharedTreeOptions<WriteFormat.v0_1_1>).attributionId;
		this.idCompressor = new IdCompressor(createSessionId(), reservedIdCount, attributionId);
		const { editLog, cachingLogViewer } = this.initializeNewEditLogFromSummary(
			{
				editChunks: [],
				editIds: [],
			},
			undefined,
			this.idCompressor,
			this.processEditResult,
			this.processSequencedEditResult,
			WriteFormat.v0_1_1
		);
		this.editLog = editLog;
		this.cachingLogViewer = cachingLogViewer;
		this.encoder_0_0_2 = new SharedTreeEncoder_0_0_2(this.summarizeHistory);
		this.encoder_0_1_1 = new SharedTreeEncoder_0_1_1(this.summarizeHistory);
	}

	/**
	 * The write format version currently used by this `SharedTree`. This is always initialized to the write format
	 * passed to the tree's constructor, but it may automatically upgrade over time (e.g. when connected to another
	 * SharedTree with a higher write format, or when loading a summary with a higher write format).
	 */
	public getWriteFormat(): WriteFormat {
		return this.writeFormat;
	}

	/**
	 * Re-computes currentIsOldest and emits an event if it has changed.
	 * TODO:#55900: Get rid of copy-pasted OldestClientObserver code
	 */
	private readonly updateOldest = () => {
		const oldest = this.computeIsOldest();
		if (this.currentIsOldest !== oldest) {
			this.currentIsOldest = oldest;
			if (oldest) {
				this.emit('becameOldest');
				this.logger.sendTelemetryEvent({ eventName: 'BecameOldestClient' });
			} else {
				this.emit('lostOldest');
			}
		}
	};

	/**
	 * Computes the oldest client in the quorum, true by default if the container is detached and false by default if the client isn't connected.
	 * TODO:#55900: Get rid of copy-pasted OldestClientObserver code
	 */
	private computeIsOldest(): boolean {
		// If the container is detached, we are the only ones that know about it and are the oldest by default.
		if (this.runtime.attachState === AttachState.Detached) {
			return true;
		}

		// If we're not connected we can't be the oldest connected client.
		if (!this.runtime.connected) {
			return false;
		}

		assert(this.runtime.clientId !== undefined, 'Client id should be set if connected.');

		const quorum = this.runtime.getQuorum();
		const selfSequencedClient = quorum.getMember(this.runtime.clientId);
		// When in readonly mode our clientId will not be present in the quorum.
		if (selfSequencedClient === undefined) {
			return false;
		}

		const members = quorum.getMembers();
		for (const sequencedClient of members.values()) {
			if (sequencedClient.sequenceNumber < selfSequencedClient.sequenceNumber) {
				return false;
			}
		}

		// No member of the quorum was older
		return true;
	}

	/**
	 * @returns the current view of the tree.
	 */
	public get currentView(): RevisionView {
		return this.logViewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
	}

	/**
	 * Generates a node identifier.
	 * The returned IDs may be used as the identifier of a node in the SharedTree.
	 * `NodeId`s are *always* unique and stable within the scope of the tree and session that generated them. They are *not* unique within
	 * a Fluid container, and *cannot* be compared across instances of a SharedTree. They are *not* stable across sessions/lifetimes of a
	 * SharedTree, and *cannot* be persisted (e.g. stored in payloads, uploaded in blobs, etc.). If stable persistence is needed,
	 * NodeIdConverter.convertToStableNodeId may be used to return a corresponding UUID that is globally unique and stable.
	 * @param override - if supplied, calls to `convertToStableNodeId` using the returned node ID will return the override instead of
	 * the UUID. Calls to `generateNodeId` with the same override always return the same ID. Performance note: passing an override string
	 * incurs a storage cost that is significantly higher that a node ID without one, and should be avoided if possible.
	 * @public
	 */
	public generateNodeId(override?: string): NodeId {
		return this.idCompressor.generateCompressedId(override) as NodeId;
	}

	/**
	 * Given a NodeId, returns the corresponding stable ID or throws if the supplied node ID was not generated with this tree (`NodeId`s
	 * may not be used across SharedTree instances, see `generateNodeId` for more).
	 * The returned value will be a UUID, unless the creation of `id` used an override string (see `generateNodeId` for more).
	 * The result is safe to persist and re-use across `SharedTree` instances, unlike `NodeId`.
	 * @public
	 */
	public convertToStableNodeId(id: NodeId): StableNodeId {
		return (this.idCompressor.tryDecompress(id) as StableNodeId) ?? fail('Node id is not known to this SharedTree');
	}

	/**
	 * Given a NodeId, attempt to return the corresponding stable ID.
	 * The returned value will be a UUID, unless the creation of `id` used an override string (see `generateNodeId` for more).
	 * The returned stable ID is undefined if `id` was never created with this SharedTree. If a stable ID is returned, this does not imply
	 * that there is a node with `id` in the current revision of the tree, only that `id` was at some point generated by some instance of
	 * this tree.
	 * @public
	 */
	public tryConvertToStableNodeId(id: NodeId): StableNodeId | undefined {
		return this.idCompressor.tryDecompress(id) as StableNodeId | undefined;
	}

	/**
	 * Given a stable ID, return the corresponding NodeId or throws if the supplied stable ID was never generated with this tree, either
	 * as a UUID corresponding to a `NodeId` or as an override passed to `generateNodeId`.
	 * If a stable ID is returned, this does not imply that there is a node with `id` in the current revision of the tree, only that
	 * `id` was at some point generated by an instance of this SharedTree.
	 * @public
	 */
	public convertToNodeId(id: StableNodeId): NodeId {
		return (
			(this.idCompressor.tryRecompress(id) as NodeId) ?? fail('Stable node id is not known to this SharedTree')
		);
	}

	/**
	 * Given a stable ID, return the corresponding NodeId or return undefined if the supplied stable ID was never generated with this tree,
	 * either as a UUID corresponding to a `NodeId` or as an override passed to `generateNodeId`.
	 * If a stable ID is returned, this does not imply that there is a node with `id` in the current revision of the tree, only that
	 * `id` was at some point generated by an instance of this SharedTree.
	 * @public
	 */
	public tryConvertToNodeId(id: StableNodeId): NodeId | undefined {
		return this.idCompressor.tryRecompress(id) as NodeId | undefined;
	}

	/**
	 * Returns the attribution ID associated with the SharedTree that generated the given node ID. This is generally only useful for clients
	 * with a write format of 0.1.1 or greater since older clients cannot be given an attribution ID and will always use the default
	 * `attributionId` of the tree.
	 * @public
	 */
	public attributeNodeId(id: NodeId): AttributionId {
		switch (this.writeFormat) {
			case WriteFormat.v0_0_2:
				return nilUuid;
			default: {
				const attributionId = this.idCompressor.attributeId(id);
				if (attributionId === ghostSessionId) {
					return nilUuid;
				}
				return attributionId;
			}
		}
	}

	/**
	 * @returns the edit history of the tree.
	 * @public
	 */
	public get edits(): OrderedEditSet<InternalizedChange> {
		return this.editLog as unknown as OrderedEditSet<InternalizedChange>;
	}

	private deserializeHandle(serializedHandle: string): IFluidHandle<ArrayBufferLike> {
		const deserializeHandle = this.serializer.parse(serializedHandle);
		assert(typeof deserializeHandle === 'object');
		return deserializeHandle as IFluidHandle<ArrayBufferLike>;
	}

	/**
	 * Uploads the edit chunk and sends the chunk starting revision along with the resulting handle as an op.
	 */
	private async uploadEditChunk(
		edits: readonly EditWithoutId<ChangeInternal>[],
		startRevision: number
	): Promise<void> {
		assert(this.writeFormat !== WriteFormat.v0_0_2, 'Edit chunking is not supported in v0_0_2');
		// SPO attachment blob upload limit is set here:
		// https://onedrive.visualstudio.com/SharePoint%20Online/_git/SPO?path=%2Fsts%2Fstsom%2FPrague%2FSPPragueProtocolConfig.cs&version=GBmaster&line=82&lineEnd=82&lineStartColumn=29&lineEndColumn=116&lineStyle=plain&_a=contents
		// TODO:#59754: Create chunks based on data buffer size instead of number of edits
		const blobUploadSizeLimit = 4194304;

		try {
			const chunkContents = this.encoder_0_1_1.encodeEditChunk(
				edits,
				sequencedIdNormalizer(this.idNormalizer),
				this.interner
			);
			const serializedContents = serializeHandles(chunkContents, this.serializer, this.handle);
			const buffer = IsoBuffer.from(serializedContents);
			const bufferSize = buffer.byteLength;
			assert(
				bufferSize <= blobUploadSizeLimit,
				`Edit chunk size ${bufferSize} is larger than blob upload size limit of ${blobUploadSizeLimit} bytes.`
			);
			const editHandle = await this.runtime.uploadBlob(buffer);
			const handleOp: SharedTreeHandleOp = {
				editHandle:
					serializeHandles(editHandle, this.serializer, this.handle) ??
					fail('Edit chunk handle could not be serialized.'),
				startRevision,
				type: SharedTreeOpType.Handle,
				version: this.writeFormat,
			};
			this.submitOp(handleOp);
			this.emit(SharedTreeDiagnosticEvent.EditChunkUploaded);
		} catch (error) {
			// If chunk load fails, we will try again later in loadCore on the oldest client so we log the error instead of throwing.
			this.logger.sendErrorEvent(
				{
					eventName: 'EditChunkUploadFailure',
				},
				error
			);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	public summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(snapshotFileName, this.saveSerializedSummary({ serializer }));
	}

	/**
	 * Saves this SharedTree into a serialized summary. This is used for testing.
	 *
	 * @param summarizer - Optional summarizer to use. If not passed in, SharedTree's summarizer is used.
	 * @internal
	 */
	public saveSerializedSummary(options?: { serializer?: IFluidSerializer }): string {
		const { serializer } = options || {};
		return serialize(this.saveSummary(), serializer ?? this.serializer, this.handle);
	}

	/**
	 * Initialize shared tree with a serialized summary. This is used for testing.
	 * @returns - statistics about the loaded summary.
	 * @internal
	 */
	public loadSerializedSummary(blobData: string): ITelemetryProperties {
		const summary = deserialize(blobData, this.serializer);
		this.loadSummary(summary);
		return getSummaryStatistics(summary);
	}

	/**
	 * Saves this SharedTree into a deserialized summary.
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
			if (this.writeFormat === WriteFormat.v0_1_1) {
				// Since we're the first client to attach, we can safely finalize ourselves since we're the only ones who have made IDs.
				this.idCompressor.finalizeCreationRange(this.idCompressor.takeNextCreationRange());
				for (const edit of this.editLog.getLocalEdits()) {
					this.internStringsFromEdit(edit);
				}
			}
			this.editLog.sequenceLocalEdits();
		}

		assert(this.editLog.numberOfLocalEdits === 0, 'generateSummary must not be called with local edits');
		return this.generateSummary();
	}

	/**
	 * Generates a SharedTree summary for the current state of the tree.
	 * Will never be called when local edits are present.
	 */
	private generateSummary(): SharedTreeSummaryBase {
		try {
			switch (this.writeFormat) {
				case WriteFormat.v0_0_2:
					return this.encoder_0_0_2.encodeSummary(this.editLog, this.currentView, this);
				case WriteFormat.v0_1_1:
					return this.encoder_0_1_1.encodeSummary(
						this.editLog,
						this.currentView,
						this,
						this.idNormalizer,
						this.interner,
						this.idCompressor.serialize(false)
					);
				default:
					fail('Unknown version');
			}
		} catch (error) {
			this.logger?.sendErrorEvent({
				eventName: 'UnsupportedSummaryWriteFormat',
				formatVersion: this.writeFormat,
			});
			throw error;
		}
	}

	/**
	 * Initialize shared tree with a deserialized summary.
	 * @internal
	 */
	public loadSummary(summary: SharedTreeSummaryBase): void {
		const { version: loadedSummaryVersion } = summary;

		if (isUpdateRequired(loadedSummaryVersion, this.writeFormat)) {
			this.submitOp({ type: SharedTreeOpType.Update, version: this.writeFormat });
			this.logger.sendTelemetryEvent({
				eventName: 'RequestVersionUpdate',
				versionFrom: loadedSummaryVersion,
				versionTo: this.writeFormat,
			});
		}

		if (compareSummaryFormatVersions(loadedSummaryVersion, this.writeFormat) !== 0) {
			// Write whatever format the loaded summary uses (this is the current agreed-upon format: it may be updated by an update op)
			this.changeWriteFormat(loadedSummaryVersion);
		}

		assert(
			this.idCompressor.getAllIdsFromLocalSession().next().done === true,
			'Summary load should not be executed after local state is created.'
		);

		let convertedSummary: SummaryContents;
		switch (loadedSummaryVersion) {
			case WriteFormat.v0_0_2:
				convertedSummary = this.encoder_0_0_2.decodeSummary(
					summary as SharedTreeSummary_0_0_2,
					this.attributionId
				);
				break;
			case WriteFormat.v0_1_1: {
				const typedSummary = summary as SharedTreeSummary;
				// See comment in factory constructor--ensure we write a consistent type of summary as how the document began.
				const loadedSummaryIncludesHistory = typedSummary.currentTree !== undefined;
				if (loadedSummaryIncludesHistory !== this.summarizeHistory) {
					this.summarizeHistory = loadedSummaryIncludesHistory;
					this.uploadEditChunks = loadedSummaryIncludesHistory;
					this.encoder_0_1_1 = new SharedTreeEncoder_0_1_1(this.summarizeHistory);
				}

				convertedSummary = this.encoder_0_1_1.decodeSummary(summary as SharedTreeSummary, this.attributionId);
				break;
			}
			default:
				fail('Unknown version');
		}

		const { editHistory, currentTree, idCompressor, interner } = convertedSummary;
		this.interner = interner;
		this.interner.getOrCreateInternedId(initialTree.definition);
		if (compareSummaryFormatVersions(loadedSummaryVersion, WriteFormat.v0_1_1) < 0) {
			const { editIds, editChunks } = editHistory;
			this.logger.sendTelemetryEvent({
				eventName: 'SummaryConversion',
				formatVersion: WriteFormat.v0_1_1,
				historySize: editIds.length,
				totalNumberOfChunks: editChunks.length,
				uploadedChunks: getNumberOfHandlesFromEditLogSummary(editHistory),
			});
		}

		this.initializeNewEditLogFromSummary(
			editHistory,
			currentTree,
			idCompressor,
			this.processEditResult,
			this.processSequencedEditResult,
			summary.version
		);

		if (this.runtime.connected) {
			const noChunksReadyForUpload = this.editLog.getEditChunksReadyForUpload()[Symbol.iterator]().next().done;
			if (noChunksReadyForUpload === undefined || !noChunksReadyForUpload) {
				// A client does not become a member of the quorum until it is within the collaboration window.
				//
				// The collaboration window is the range from the minimum sequence number enforced by the server and head.
				// When a client sends an op, they include the last sequence number the client has processed. We call this the reference
				// sequence number.
				//
				// If there are no members in the quorum, we send a no op op in order to have this client added as a member to the quorum.
				// This is required so we can ensure only the oldest client will upload blobs during summary load.
				if (this.runtime.getQuorum().getMembers().size === 0) {
					const noop: SharedTreeNoOp = {
						type: SharedTreeOpType.NoOp,
						version: this.writeFormat,
					};

					this.submitOp(noop);
					this.logger.sendTelemetryEvent({ eventName: 'NoOpSent' });
				} else if (this.currentIsOldest) {
					this.uploadCatchUpBlobs();
				}
			}

			// If this client becomes the oldest, it should take care of uploading catch up blobs.
			this.on('becameOldest', () => this.uploadCatchUpBlobs());
		}
	}

	private static eventFromEditResult(editStatus: EditStatus): SharedTreeDiagnosticEvent {
		switch (editStatus) {
			case EditStatus.Applied:
				return SharedTreeDiagnosticEvent.AppliedEdit;
			case EditStatus.Invalid:
				return SharedTreeDiagnosticEvent.DroppedInvalidEdit;
			default:
				return SharedTreeDiagnosticEvent.DroppedMalformedEdit;
		}
	}

	/**
	 * Initializes a new `EditLog` and `CachingLogViewer` on this `SharedTree`, replacing and disposing of any previously existing ones.
	 * @returns the initialized values (this is mostly to keep the constructor happy)
	 */
	private initializeNewEditLogFromSummary(
		editHistory: EditLogSummary<ChangeInternal, EditHandle<ChangeInternal>>,
		currentTree: ChangeNode | undefined,
		idCompressor: IdCompressor,
		editStatusCallback: EditStatusCallback,
		sequencedEditResultCallback: SequencedEditResultCallback,
		version: WriteFormat
	): { editLog: EditLog<ChangeInternal>; cachingLogViewer: CachingLogViewer } {
		this.idCompressor = idCompressor;
		// Dispose the current log viewer if it exists. This ensures that re-used EditAddedHandlers below don't retain references to old
		// log viewers.
		this.cachingLogViewer?.detachFromEditLog();
		const indexOfFirstEditInSession =
			version === WriteFormat.v0_0_2 || (editHistory?.editIds.length === 1 && version === WriteFormat.v0_1_1)
				? 0
				: editHistory?.editIds.length;

		// Use previously registered EditAddedHandlers if there is an existing EditLog.
		const editLog = new EditLog(
			editHistory,
			this.logger,
			this.editLog?.editAddedHandlers,
			indexOfFirstEditInSession
		);

		editLog.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => {
			this.emit(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk);
		});

		let knownRevisions: [number, EditCacheEntry][] | undefined;
		if (currentTree !== undefined) {
			const currentView = RevisionView.fromTree(currentTree);
			// TODO:#47830: Store multiple checkpoints in summary.
			knownRevisions = [[editLog.length, { view: currentView }]];
		}

		const logViewer = new CachingLogViewer(
			editLog,
			RevisionView.fromTree(initialTree, this),
			knownRevisions,
			editStatusCallback,
			sequencedEditResultCallback,
			0
		);

		this.editLog = editLog;
		this.cachingLogViewer = logViewer;
		return { editLog, cachingLogViewer: logViewer };
	}

	/**
	 * Upload any full chunks that have yet to be uploaded.
	 */
	private uploadCatchUpBlobs(): void {
		if (this.writeFormat !== WriteFormat.v0_0_2 && this.uploadEditChunks) {
			for (const [startRevision, chunk] of this.editLog.getEditChunksReadyForUpload()) {
				this.uploadEditChunk(chunk, startRevision)
					.then(() => {
						this.emit(SharedTreeDiagnosticEvent.CatchUpBlobUploaded);
						this.logger.sendTelemetryEvent({ eventName: 'CatchUpBlobUpload', chunkSize: chunk.length });
					})
					// It is safe to swallow errors from edit chunk upload because the next summary load will
					// do another attempt to upload the edit chunks that couldn't previously be uploaded
					.catch((error) => {});
			}
		}
	}

	/**
	 * Compares this shared tree to another for equality. Should only be used for internal correctness testing.
	 *
	 * Equality means that the histories as captured by the EditLogs are equivalent.
	 *
	 * Equality does not include:
	 *   - if an edit is open
	 *   - the shared tree's id
	 *   - local vs sequenced status of edits
	 *   - registered event listeners
	 *   - state of caches
	 *
	 * @internal
	 * */
	public equals(sharedTree: SharedTree): boolean {
		if (!areRevisionViewsSemanticallyEqual(this.currentView, this, sharedTree.currentView, sharedTree)) {
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

			const stats = this.loadSerializedSummary(blobData);

			summaryLoadPerformanceEvent.end(stats);
		} catch (error) {
			summaryLoadPerformanceEvent.cancel({ eventName: 'SummaryLoadFailure' }, error);
			throw error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: unknown, local: boolean): void {
		const typedMessage = message as Omit<ISequencedDocumentMessage, 'contents'> & {
			contents: SharedTreeOp_0_0_2 | SharedTreeOp;
		};
		this.cachingLogViewer.setMinimumSequenceNumber(typedMessage.minimumSequenceNumber);
		const op = typedMessage.contents;
		const { type, version } = op;
		const resolvedVersion = version ?? WriteFormat.v0_0_2;
		const sameVersion = resolvedVersion === this.writeFormat;

		// Edit and handle ops should only be processed if they're the same version as the tree write version.
		// Update ops should only be processed if they're not the same version.
		if (sameVersion) {
			if (type === SharedTreeOpType.Handle) {
				const { editHandle, startRevision } = op as SharedTreeHandleOp;
				const baseHandle = this.deserializeHandle(editHandle);
				const decodedHandle: EditHandle<ChangeInternal> = {
					get: async () => {
						const contents = await baseHandle.get();
						const parsedContents: EditChunkContents = JSON.parse(IsoBuffer.from(contents).toString());
						return this.encoder_0_1_1.decodeEditChunk(
							parsedContents,
							sequencedIdNormalizer(this.idNormalizer),
							this.interner
						);
					},
					baseHandle,
				};
				this.editLog.processEditChunkHandle(decodedHandle, startRevision);
			} else if (type === SharedTreeOpType.Edit) {
				if (op.version === WriteFormat.v0_1_1) {
					// TODO: This cast can be removed on typescript 4.6
					this.idCompressor.finalizeCreationRange((op as SharedTreeEditOp).idRange);
				}
				// TODO: This cast can be removed on typescript 4.6
				const edit = this.parseSequencedEdit(op as SharedTreeEditOp | SharedTreeEditOp_0_0_2);
				if (op.version === WriteFormat.v0_1_1) {
					this.internStringsFromEdit(edit);
				}
				this.processSequencedEdit(edit, typedMessage);
			}
		} else if (type === SharedTreeOpType.Update) {
			this.processVersionUpdate(op.version);
		} else if (compareSummaryFormatVersions(resolvedVersion, this.writeFormat) === 1) {
			// An op version newer than our current version should not be received. If this happens, either an
			// incorrect op version has been written or an update op was skipped.
			const error = 'Newer op version received by a client that has yet to be updated.';
			this.logger.sendErrorEvent(
				{
					eventName: 'UnexpectedNewerOpVersion',
				},
				error
			);
			fail(error);
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

	/**
	 * Parses a sequenced edit. This is only invoked for ops with version matching the current `writeFormat`.
	 */
	private parseSequencedEdit(op: SharedTreeEditOp | SharedTreeEditOp_0_0_2): Edit<ChangeInternal> {
		// TODO:Type Safety: Improve type safety around op sending/parsing (e.g. discriminated union over version field somehow)
		switch (op.version) {
			case WriteFormat.v0_0_2:
				return this.encoder_0_0_2.decodeEditOp(op, this.encodeSemiSerializedEdit.bind(this), this);
			case WriteFormat.v0_1_1:
				return this.encoder_0_1_1.decodeEditOp(
					op,
					this.encodeSemiSerializedEdit.bind(this),
					this.idNormalizer,
					this.interner
				);
			default:
				fail('Unknown op version');
		}
	}

	private encodeSemiSerializedEdit<T>(semiSerializedEdit: Edit<T>): Edit<T> {
		// semiSerializedEdit may have handles which have been replaced by `serializer.encode`.
		// Since there is no API to un-replace them except via parse, re-stringify the edit, then parse it.
		// Stringify using JSON, not IFluidSerializer since OPs use JSON directly.
		// TODO:Performance:#48025: Avoid this serialization round trip.
		const encodedEdit: Edit<T> = this.serializer.parse(JSON.stringify(semiSerializedEdit));
		return encodedEdit;
	}

	private processSequencedEdit(edit: Edit<ChangeInternal>, message: ISequencedDocumentMessage): void {
		const { id: editId } = edit;
		const wasLocalEdit = this.editLog.isLocalEdit(editId);

		// If the id of the supplied edit matches a non-local edit already present in the log, this would normally be indicative of an error.
		// However, the @fluidframework packages prior to 0.37.x have a bug which can cause data corruption by sequencing duplicate edits--
		// see discussion on the following github issue: https://github.com/microsoft/FluidFramework/issues/4399
		// To work around this issue, we currently tolerate duplicate ops in loaded documents.
		// This could be strengthened in the future to only apply to documents which may have been impacted.
		const shouldIgnoreEdit = this.editLog.tryGetIndexOfId(editId) !== undefined && !wasLocalEdit;
		if (shouldIgnoreEdit) {
			return;
		}

		if (wasLocalEdit) {
			this.editLog.addSequencedEdit(edit, message);
			// If this client created the edit that filled up a chunk, it is responsible for uploading that chunk.
			if (compareSummaryFormatVersions(this.writeFormat, WriteFormat.v0_0_2) > 0 && this.uploadEditChunks) {
				const lastPair = this.editLog.getLastEditChunk();
				if (lastPair !== undefined) {
					const [startRevision, chunk] = lastPair;
					const edits = assertNotUndefined(chunk.edits);
					if (edits.length === this.editLog.editsPerChunk) {
						this.uploadEditChunk(edits, startRevision)
							.then(() => {
								this.logger.sendTelemetryEvent({
									eventName: 'EditChunkUpload',
									chunkSize: edits.length,
								});
							})
							// It is safe to swallow errors from edit chunk upload because the next summary load will
							// do another attempt to upload the edit chunks that couldn't previously be uploaded
							.catch((error) => {});
					}
				}
			}
		} else {
			this.applyEditLocally(edit, message);
		}
	}

	/**
	 * Updates SharedTree to the provided version if the version is a valid write version newer than the current version.
	 * @param version - The version to update to.
	 */
	private processVersionUpdate(version: WriteFormat) {
		if (isUpdateRequired(this.writeFormat, version)) {
			PerformanceEvent.timedExec(
				this.logger,
				{ eventName: 'VersionUpdate', version },
				() => {
					if (compareSummaryFormatVersions(version, WriteFormat.v0_1_1) >= 0) {
						this.upgradeFrom_0_0_2_to_0_1_1();
					} else {
						throw new Error(`Updating to version ${version} is not supported.`);
					}

					this.changeWriteFormat(version);

					// The edit log may contain some local edits submitted after the version update op was submitted but
					// before we receive the message it has been sequenced. Since these edits must be sequenced after the version
					// update op, they will be discarded. These edits are then re-submitted using the new format.
					for (const edit of this.editLog.getLocalEdits()) {
						this.submitEditOp(edit);
					}

					if (this.currentIsOldest) {
						this.uploadCatchUpBlobs();
					}
				},
				{
					end: true,
					cancel: 'error',
				}
			);
		}
	}

	private upgradeFrom_0_0_2_to_0_1_1(): void {
		// Reset the string interner, re-populate only with information that there is consensus on
		this.interner = new MutableStringInterner([initialTree.definition]);
		const oldIdCompressor = this.idCompressor;
		// Create the IdCompressor that will be used after the upgrade
		const newIdCompressor = new IdCompressor(createSessionId(), reservedIdCount, this.attributionId);
		const newContext = getNodeIdContext(newIdCompressor);
		// Generate all local IDs in the new compressor that were in the old compressor and preserve their UUIDs.
		// This will allow the client to continue to use local IDs that were allocated pre-upgrade
		for (const localId of oldIdCompressor.getAllIdsFromLocalSession()) {
			newIdCompressor.generateCompressedId(oldIdCompressor.decompress(localId));
		}

		const unifyHistoricalIds = (context: NodeIdContext): void => {
			for (let i = 0; i < this.editLog.numberOfSequencedEdits; i++) {
				const edit = this.editLog.getEditInSessionAtIndex(i);
				convertEditIds(edit, (id) => context.generateNodeId(this.convertToStableNodeId(id)));
			}
		};
		// Construct a temporary "ghost" compressor which is used to generate final IDs that will be consistent across all upgrading clients
		const ghostIdCompressor = new IdCompressor(ghostSessionId, reservedIdCount);
		const ghostContext = getNodeIdContext(ghostIdCompressor);
		if (this.summarizeHistory) {
			// All clients have the full history, and can therefore all "generate" the same final IDs for every ID in the history
			// via the ghost compressor.
			unifyHistoricalIds(ghostContext);
			// The same logic applies to string interning, so intern all the strings in the history (superset of those in the current view)
			for (let i = 0; i < this.editLog.numberOfSequencedEdits; i++) {
				this.internStringsFromEdit(this.editLog.getEditInSessionAtIndex(i));
			}
		} else {
			// Clients do not have the full history, but all share the same current view (sequenced). They can all finalize the same final
			// IDs for every ID in the view via the ghost compressor.
			// The same logic applies for the string interner.
			for (const node of this.logViewer.getRevisionViewInSession(this.editLog.numberOfSequencedEdits)) {
				ghostContext.generateNodeId(this.convertToStableNodeId(node.identifier));
				this.interner.getOrCreateInternedId(node.definition);
				for (const label of [...node.traits.keys()].sort()) {
					this.interner.getOrCreateInternedId(label);
				}
			}
			// Every node in this client's history can simply be generated in the new compressor as well, preserving the UUID
			unifyHistoricalIds(newContext);
		}
		// Finalize any IDs in the ghost compressor into the actual compressor. This simulates all clients reaching a consensus on those IDs
		newIdCompressor.finalizeCreationRange(ghostIdCompressor.takeNextCreationRange());
		this.idCompressor = newIdCompressor;
	}

	/**
	 * Applies a set of changes to this tree. The result will be reflected in `SharedTree.currentView`.
	 * This method does not allow for snapshot isolation, as the changes are always applied to the most recent revision.
	 * If it is desireable to read from and apply changes to a fixed view that does not change when remote changes arrive, `Checkout`
	 * should be used instead.
	 * @public
	 */
	public applyEdit(...changes: Change[]): Edit<InternalizedChange>;
	public applyEdit(changes: Change[]): Edit<InternalizedChange>;
	public applyEdit(headOrChanges: Change | Change[], ...tail: Change[]): Edit<InternalizedChange> {
		const changes = Array.isArray(headOrChanges) ? headOrChanges : [headOrChanges, ...tail];
		const id = newEditId();
		const internalEdit: Edit<ChangeInternal> = {
			id,
			changes: changes.map((c) => this.internalizeChange(c)),
		};
		this.submitEditOp(internalEdit);
		this.applyEditLocally(internalEdit, undefined);
		return internalEdit as unknown as Edit<InternalizedChange>;
	}

	/**
	 * Merges `edits` from `other` into this SharedTree.
	 * @param other - Tree containing the edits that should be applied to this one.
	 * @param edits - Iterable of edits from `other` to apply.
	 * @param stableIdRemapper - Optional remapper to translate stable identities from `other` into stable identities on this tree.
	 * Any references that `other` contains to a stable id `foo` will be replaced with references to the id `stableIdRemapper(foo)`.
	 *
	 * Payloads on the edits are left intact.
	 * @returns a list containing `EditId`s for all applied edits.
	 */
	public mergeEditsFrom(
		other: SharedTree,
		edits: Iterable<Edit<InternalizedChange>>,
		stableIdRemapper?: (id: StableNodeId) => StableNodeId
	): EditId[] {
		const idConverter = (id: NodeId) => {
			const stableId = other.convertToStableNodeId(id);
			const convertedStableId = stableIdRemapper?.(stableId) ?? stableId;
			return this.generateNodeId(convertedStableId);
		};

		return Array.from(
			edits as unknown as Iterable<Edit<ChangeInternal>>,
			(edit) => this.applyEditInternal(convertEditIds(edit, (id) => idConverter(id))).id
		);
	}

	/**
	 * Applies a set of internal changes to this tree. The result will be reflected in `SharedTree.currentView`.
	 * External users should use one of the more specialized functions, like `applyEdit` which handles constructing the actual `Edit`
	 * and uses public Change types.
	 * This is exposed for internal use only.
	 * @internal
	 */
	public applyEditInternal(editOrChanges: Edit<ChangeInternal> | readonly ChangeInternal[]): Edit<ChangeInternal> {
		let edit: Edit<ChangeInternal>;
		if (Array.isArray(editOrChanges)) {
			const id = newEditId();
			edit = { id, changes: editOrChanges };
		} else {
			edit = editOrChanges as Edit<ChangeInternal>;
		}
		this.submitEditOp(edit);
		this.applyEditLocally(edit, undefined);
		return edit;
	}

	/**
	 * Converts a public Change type to an internal representation.
	 * This is exposed for internal use only.
	 * @internal
	 */
	public internalizeChange(change: Change): ChangeInternal {
		switch (change.type) {
			case ChangeType.Insert:
				return {
					source: change.source as DetachedSequenceId,
					destination: deepCloneStablePlace(change.destination),
					type: ChangeTypeInternal.Insert,
				};
			case ChangeType.Detach: {
				const detach: DetachInternal = {
					source: deepCloneStableRange(change.source),
					type: ChangeTypeInternal.Detach,
				};
				copyPropertyIfDefined(change, detach, 'destination');
				return detach;
			}
			case ChangeType.Build: {
				if (isTreeNodeSequence(change.source)) {
					const source = change.source.map((buildNode) =>
						convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
							buildNode,
							(nodeData) => internalizeBuildNode(nodeData, this),
							(x): x is number => typeof x === 'number'
						)
					) as TreeNodeSequence<TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId>;
					return {
						source,
						destination: change.destination as DetachedSequenceId,
						type: ChangeTypeInternal.Build,
					};
				} else {
					const source = convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
						change.source,
						(nodeData) => internalizeBuildNode(nodeData, this),
						(x): x is number => typeof x === 'number'
					) as TreeNode<BuildNodeInternal, NodeId> | DetachedSequenceId;
					return {
						source: [source],
						destination: change.destination as DetachedSequenceId,
						type: ChangeTypeInternal.Build,
					};
				}
			}
			case ChangeType.SetValue:
				return {
					nodeToModify: change.nodeToModify,
					payload: change.payload,
					type: ChangeTypeInternal.SetValue,
				};
			case ChangeType.Constraint: {
				const constraint: ConstraintInternal = {
					effect: change.effect,
					toConstrain: change.toConstrain,
					type: ChangeTypeInternal.Constraint,
				};
				copyPropertyIfDefined(change, constraint, 'contentHash');
				copyPropertyIfDefined(change, constraint, 'identityHash');
				copyPropertyIfDefined(change, constraint, 'label');
				copyPropertyIfDefined(change, constraint, 'length');
				copyPropertyIfDefined(change, constraint, 'parentNode');
				return constraint;
			}
			default:
				fail('unexpected change type');
		}
	}

	private applyEditLocally(edit: Edit<ChangeInternal>, message: ISequencedDocumentMessage | undefined): void {
		const isSequenced = message !== undefined;
		if (isSequenced) {
			// TODO: This cast can be removed on typescript 4.6
			this.editLog.addSequencedEdit(edit, message as ISequencedDocumentMessage);
		} else {
			this.editLog.addLocalEdit(edit);
		}

		const eventArguments: EditCommittedEventArguments = {
			editId: edit.id,
			local: !isSequenced,
			tree: this,
		};
		this.emit(SharedTreeEvent.EditCommitted, eventArguments);
	}

	/**
	 * Reverts a previous edit by applying a new edit containing the inverse of the original edit's changes.
	 * @param editId - the edit to revert
	 * @returns the id of the new edit, or undefined if the original edit could not be inverted given the current tree state.
	 * @public
	 */
	public revert(editId: EditId): EditId | undefined {
		const index = this.edits.getIndexOfId(editId);
		const edit = this.edits.getEditInSessionAtIndex(index);
		const before = this.logViewer.getRevisionViewInSession(index);
		const changes = this.revertChanges(edit.changes, before);
		if (changes === undefined) {
			return undefined;
		}

		return this.applyEditInternal(changes).id;
	}

	/**
	 * Revert the given changes
	 * @param changes - the changes to revert
	 * @param before - the revision view before the changes were originally applied
	 * @returns the inverse of `changes` or undefined if the changes could not be inverted for the given tree state.
	 * @internal
	 */
	public revertChanges(changes: readonly InternalizedChange[], before: RevisionView): ChangeInternal[] | undefined {
		return revert(changes as unknown as readonly ChangeInternal[], before);
	}

	/**
	 * Submits an edit by the local client to the runtime.
	 */
	private submitEditOp(edit: Edit<ChangeInternal>): void {
		// Only submit ops if attached, since op submission can have stateful side effects (e.g. changing the IdCompressor)
		// Ops will be submitted again when attached (see loadSummary())
		if (this.isAttached()) {
			switch (this.writeFormat) {
				case WriteFormat.v0_0_2:
					this.submitOp(this.encoder_0_0_2.encodeEditOp(edit, this.serializeEdit.bind(this), this));
					break;
				case WriteFormat.v0_1_1:
					this.submitOp(
						this.encoder_0_1_1.encodeEditOp(
							edit,
							this.serializeEdit.bind(this),
							this.idCompressor.takeNextCreationRange(),
							this.idNormalizer,
							this.interner
						)
					);
					break;
				default:
					fail('Unknown version');
			}
		}
	}

	private serializeEdit<TChange>(preparedEdit: Edit<TChange>): Edit<TChange> {
		return this.serializer.encode(preparedEdit, this.handle) as Edit<TChange>;
	}

	/** A type-safe `submitLocalMessage` wrapper to enforce op format */
	private submitOp(content: SharedTreeOp | SharedTreeOp_0_0_2, localOpMetadata: unknown = undefined): void {
		assert(
			compareSummaryFormatVersions(content.version, this.writeFormat) === 0,
			'Attempted to submit op of wrong version'
		);
		this.submitLocalMessage(content, localOpMetadata);
	}

	public getRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	/**
	 * "Pending local state" refers to ops submitted to the runtime that have not yet been acked.
	 * When closing a container, hosts have the option to stash this pending local state somewhere to be reapplied
	 * later (to avoid data loss).
	 * If a host then loads a container using that stashed state, this function is called for each stashed op, and is expected to:
	 * 1. Update this DDS to reflect that state locally.
	 * 2. Return any `localOpMetadata` that would have been associated with this op.
	 *
	 * @param content - op to apply locally.
	 */
	protected applyStashedOp(op: unknown): void {
		const sharedTreeOp = op as SharedTreeOp | SharedTreeOp_0_0_2;
		switch (sharedTreeOp.type) {
			case SharedTreeOpType.Edit: {
				switch (this.writeFormat) {
					case WriteFormat.v0_0_2:
						switch (sharedTreeOp.version) {
							case WriteFormat.v0_0_2: {
								const edit = this.parseSequencedEdit(sharedTreeOp);
								this.applyEditLocally(edit, undefined);
								break;
							}
							case WriteFormat.v0_1_1:
								// TODO:#74390: Implement
								fail('Received stashed op 0.1.1 before upgrade');
							default:
								fail('Unknown version');
						}
						break;
					case WriteFormat.v0_1_1:
						switch (sharedTreeOp.version) {
							case WriteFormat.v0_0_2:
								// TODO:#74390: Implement
								fail('v0.1.1 does not support stashed ops.');
							case WriteFormat.v0_1_1:
								// TODO:#74390: Implement
								fail('v0.1.1 does not support stashed ops.');
							default:
								fail('Unknown version');
						}
					default:
						fail('Unknown version');
				}
				break;
			}
			// Handle and update ops are only acknowledged by the client that generated them upon sequencing--no local changes necessary.
			case SharedTreeOpType.Handle:
			case SharedTreeOpType.Update:
			case SharedTreeOpType.NoOp:
				break;
			default:
				fail('Unrecognized op');
		}
	}

	private changeWriteFormat(newFormat: WriteFormat): void {
		this.writeFormat = newFormat;
		this.emit(SharedTreeDiagnosticEvent.WriteVersionChanged, newFormat);
	}

	/**
	 * Interns all Definitions and TraitLabel_s referenced by the provided edit.
	 *
	 * Clients must have consensus on the interned values to guarantee the interned ID is valid.
	 */
	private internStringsFromEdit(edit: Edit<ChangeInternal>): void {
		for (const change of edit.changes) {
			if (change.type === ChangeTypeInternal.Build) {
				for (const root of change.source) {
					walkTree<TreeNode<BuildNodeInternal, NodeId>, DetachedSequenceId>(
						root,
						(node) => {
							this.interner.getOrCreateInternedId(node.definition);
							for (const trait of Object.keys(node.traits)) {
								this.interner.getOrCreateInternedId(trait);
							}
						},
						isDetachedSequenceId
					);
				}
			} else if (change.type === ChangeTypeInternal.Insert) {
				const { referenceTrait } = change.destination;
				if (referenceTrait !== undefined) {
					this.interner.getOrCreateInternedId(referenceTrait.label);
				}
			}
		}
	}
}

/**
 * @returns 1 if versionA is newer, -1 if versionB is newer, and 0 if the versions are the same.
 * @throws if either version isn't a valid WriteFormat version.
 */
function compareSummaryFormatVersions(versionA: string, versionB: string): number {
	const versionAIndex = sortedWriteVersions.indexOf(versionA as WriteFormat);
	const versionBIndex = sortedWriteVersions.indexOf(versionB as WriteFormat);

	if (versionAIndex === -1 || versionBIndex === -1) {
		fail('Summary version being compared cannot be read.');
	}

	if (versionAIndex < versionBIndex) {
		return -1;
	} else if (versionAIndex > versionBIndex) {
		return 1;
	}

	return 0;
}

/**
 * Checks if the summary version needs to be updated.
 * @returns true if the old version is older than the new version.
 * @throws if the new version isn't a supported WriteFormat version.
 */
function isUpdateRequired(oldVersion: string, newVersion: string): boolean {
	const newVersionIndex = sortedWriteVersions.indexOf(newVersion as WriteFormat);
	if (newVersionIndex === -1) {
		fail('New write version is invalid.');
	}

	return compareSummaryFormatVersions(oldVersion, newVersion) === -1 ? true : false;
}

function isTreeNodeSequence(source: TreeNodeSequence<BuildNode> | BuildNode): source is TreeNodeSequence<BuildNode> {
	return Array.isArray(source);
}
