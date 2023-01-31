/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	ISequencedDocumentMessage,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { mergeStats } from "@fluidframework/runtime-utils";
import {
	IFluidSerializer,
	ISharedObjectEvents,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { v4 as uuid } from "uuid";
import { ChangeFamily, Commit, EditManager, SeqNumber, AnchorSet, Delta } from "../core";
import { brand, isReadonlyArray, JsonCompatibleReadOnly } from "../util";
import { createEmitter, ISubscribable, TransformEvents } from "../events";

/**
 * The events emitted by a {@link SharedTreeCore}
 *
 * TODO: Add/remove events
 */
export interface ISharedTreeCoreEvents {
	updated: () => void;
}

// TODO: How should the format version be determined?
const formatVersion = 0;

export interface IndexEvents<TChangeset> {
	/**
	 * @param change - change that was just sequenced.
	 * @param derivedFromLocal - iff provided, change was a local change (from this session)
	 * which is now sequenced (and thus no longer local).
	 */
	newSequencedChange: (change: TChangeset, derivedFromLocal?: TChangeset) => void;

	/**
	 * @param change - change that was just applied locally.
	 */
	newLocalChange: (change: TChangeset) => void;

	/**
	 * @param changeDelta - composed changeset from previous local state
	 * (state after all sequenced then local changes are accounted for) to current local state.
	 * May involve effects of a new sequenced change (including rebasing of local changes onto it),
	 * or a new local change. Called after either sequencedChange or newLocalChange.
	 */
	newLocalState: (changeDelta: Delta.Root) => void;
}

/**
 * Generic shared tree, which needs to be configured with indexes, field kinds and a history policy to be used.
 *
 * TODO: actually implement
 * TODO: is history policy a detail of what indexes are used, or is there something else to it?
 */
export class SharedTreeCore<
	TChange,
	TChangeFamily extends ChangeFamily<any, TChange>,
	TIndexes extends readonly Index[],
> extends SharedObject<TransformEvents<ISharedTreeCoreEvents, ISharedObjectEvents>> {
	/**
	 * A random ID that uniquely identifies this client in the collab session.
	 * This is sent alongside every op to identify which client the op originated from.
	 *
	 * This is needed because the client ID given by the Fluid protocol is not stable across reconnections.
	 */
	private readonly stableId: string;

	/**
	 * All {@link SummaryElement}s that are present on any {@link Index}es in this DDS
	 */
	private readonly summaryElements: SummaryElement[];

	/**
	 * The sequence number that this instance is at.
	 * This is number is artificial in that it is made up by this instance as opposed to being provided by the runtime.
	 * Is `undefined` after (and only after) this instance is attached.
	 */
	private detachedRevision: SeqNumber | undefined = brand(Number.MIN_SAFE_INTEGER);

	/**
	 * The indexes available to this tree.
	 * These are declared at construction time.
	 */
	protected readonly indexes: TIndexes;

	/**
	 * Provides events that indexes can subscribe to
	 */
	private readonly indexEventEmitter = createEmitter<IndexEvents<TChange>>();

	/**
	 * @param indexes - A list of indexes, either as an array or as a factory function
	 * @param changeFamily - The change family
	 * @param editManager - The edit manager
	 * @param anchors - The anchor set
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 * @param telemetryContextPrefix - the context for any telemetry logs/errors emitted
	 */
	public constructor(
		indexes: TIndexes | ((events: ISubscribable<IndexEvents<TChange>>) => TIndexes),
		public readonly changeFamily: TChangeFamily,
		public readonly editManager: EditManager<TChange, TChangeFamily>,
		anchors: AnchorSet,

		// Base class arguments
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		this.stableId = uuid();
		editManager.initSessionId(this.stableId);
		this.indexes = isReadonlyArray(indexes) ? indexes : indexes(this.indexEventEmitter);
		this.summaryElements = this.indexes
			.map((i) => i.summaryElement)
			.filter((e): e is SummaryElement => e !== undefined);
		assert(
			new Set(this.summaryElements.map((e) => e.key)).size === this.summaryElements.length,
			0x350 /* Index summary element keys must be unique */,
		);
	}

	// TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
	// We might want to not subclass it, or override/reimplement most of its functionality.
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		let stats = mergeStats();
		const summary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {},
		};
		stats.treeNodeCount += 1;

		// Merge the summaries of all indexes together under a single ISummaryTree
		const indexSummaryTree: ISummaryTree["tree"] = {};
		for (const summaryElement of this.summaryElements) {
			const { stats: elementStats, summary: elementSummary } =
				summaryElement.getAttachSummary(
					(contents) => serializer.stringify(contents, this.handle),
					undefined,
					undefined,
					telemetryContext,
				);
			indexSummaryTree[summaryElement.key] = elementSummary;
			stats = mergeStats(stats, elementStats);
		}

		summary.tree.indexes = {
			type: SummaryType.Tree,
			tree: indexSummaryTree,
		};
		stats.treeNodeCount += 1;

		return {
			stats,
			summary,
		};
	}

	protected async loadCore(services: IChannelStorageService): Promise<void> {
		const loadIndexes = this.summaryElements.map(async (summaryElement) =>
			summaryElement.load(
				scopeStorageService(services, "indexes", summaryElement.key),
				(contents) => this.serializer.parse(contents),
			),
		);

		await Promise.all(loadIndexes);
	}

	public submitEdit(edit: TChange): void {
		const delta = this.editManager.addLocalChange(edit);
		// Edits performed before the first attach are treated as sequenced because they will be included
		// in the attach summary that is uploaded to the service.
		// Until this attach workflow happens, this instance essentially behaves as a centralized data structure.
		if (this.detachedRevision !== undefined) {
			const newRevision: SeqNumber = brand((this.detachedRevision as number) + 1);
			const commit: Commit<TChange> = {
				changeset: edit,
				refNumber: this.detachedRevision,
				seqNumber: newRevision,
				sessionId: this.stableId,
			};
			this.detachedRevision = newRevision;
			this.editManager.addSequencedChange(commit);
		}
		this.indexEventEmitter.emit("newLocalChange", edit);
		this.indexEventEmitter.emit("newLocalState", delta);
		const message: Message = {
			originatorId: this.stableId,
			changeset: this.changeFamily.encoder.encodeForJson(formatVersion, edit),
		};
		this.submitLocalMessage(message);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		const { originatorId: stableClientId, changeset } = message.contents as Message;
		const changes = this.changeFamily.encoder.decodeJson(formatVersion, changeset);
		const commit: Commit<TChange> = {
			sessionId: stableClientId,
			seqNumber: brand(message.sequenceNumber),
			refNumber: brand(message.referenceSequenceNumber),
			changeset: changes,
		};

		const delta = this.editManager.addSequencedChange(commit);
		const sequencedChange = this.editManager.getLastSequencedChange();
		this.indexEventEmitter.emit("newSequencedChange", sequencedChange);
		this.indexEventEmitter.emit("newLocalState", delta);
		this.editManager.advanceMinimumSequenceNumber(message.minimumSequenceNumber);
	}

	protected onDisconnect() {}

	protected didAttach(): void {
		if (this.detachedRevision !== undefined) {
			this.detachedRevision = undefined;
		}
	}

	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		const gcNodes: IGarbageCollectionData["gcNodes"] = {};
		for (const summaryElement of this.summaryElements) {
			for (const [id, routes] of Object.entries(summaryElement.getGCData(fullGC).gcNodes)) {
				gcNodes[id] ??= [];
				for (const route of routes) {
					gcNodes[id].push(route);
				}
			}
		}

		return {
			gcNodes,
		};
	}
}

/**
 * The format of messages that SharedTree sends and receives.
 */
interface Message {
	/**
	 * The stable ID that identifies the originator of the message.
	 */
	readonly originatorId: string;
	/**
	 * The changeset to be applied.
	 */
	readonly changeset: JsonCompatibleReadOnly;
}

/**
 * Observes Changesets (after rebase), after writes data into summaries when requested.
 */
export interface Index {
	/**
	 * If provided, records data into summaries.
	 */
	readonly summaryElement?: SummaryElement;
}

/**
 * Specifies the behavior of an {@link Index} that puts data in a summary.
 */
export interface SummaryElement {
	/**
	 * Field name in summary json under which this element stores its data.
	 *
	 * TODO: define how this is used (ex: how does user of index consume this before calling loadCore).
	 */
	readonly key: string;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 * @param stringify - Serializes the contents of the index (including {@link IFluidHandle}s) for storage.
	 */
	getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the index (including {@link IFluidHandle}s) for storage.
	 */
	summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats>;

	/**
	 * {@inheritDoc (ISharedObject:interface).getGCData}
	 */
	// TODO: Change this interface (and the one in ISharedObject, if necessary) to support "handles within handles".
	// Consider the case of a document with history; the return value here currently grows unboundedly.
	getGCData(fullGC?: boolean): IGarbageCollectionData;

	/**
	 * Allows the index to perform custom loading. The storage service is scoped to this index and therefore
	 * paths in this index will not collide with those in other indexes, even if they are the same string.
	 * @param service - Storage used by the index
	 * @param parse - Parses serialized data from storage into runtime objects for the index
	 */
	load(service: IChannelStorageService, parse: SummaryElementParser): Promise<void>;
}

/**
 * Serializes the given contents into a string acceptable for storing in summaries, i.e. all
 * Fluid handles have been replaced appropriately by an IFluidSerializer
 */
export type SummaryElementStringifier = (contents: unknown) => string;

/**
 * Parses a serialized/summarized string into an object, rehydrating any Fluid handles as necessary
 */
export type SummaryElementParser = (contents: string) => unknown;

/**
 * Compose an {@link IChannelStorageService} which prefixes all paths before forwarding them to the original service
 */
function scopeStorageService(
	service: IChannelStorageService,
	...pathElements: string[]
): IChannelStorageService {
	const scope = `${pathElements.join("/")}/`;

	return {
		async readBlob(path: string): Promise<ArrayBufferLike> {
			return service.readBlob(`${scope}${path}`);
		},
		async contains(path) {
			return service.contains(`${scope}${path}`);
		},
		async list(path) {
			return service.list(`${scope}${path}`);
		},
	};
}
