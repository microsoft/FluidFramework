/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { ICodecOptions, IJsonCodec } from "../codec";
import { ChangeFamily, ChangeFamilyEditor, GraphCommit } from "../core";
import { brand, JsonCompatibleReadOnly, generateStableId } from "../util";
import { SharedTreeBranch, getChangeReplaceType } from "./branch";
import { EditManagerSummarizer } from "./editManagerSummarizer";
import { EditManager, minimumPossibleSequenceNumber } from "./editManager";
import { SeqNumber } from "./editManagerFormat";
import { DecodedMessage } from "./messageTypes";
import { makeMessageCodec } from "./messageCodecs";
import { RevisionTagCodec } from "./revisionTagCodecs";

// TODO: How should the format version be determined?
const formatVersion = 0;
// TODO: Organize this to be adjacent to persisted types.
const summarizablesTreeKey = "indexes";

/**
 * Generic shared tree, which needs to be configured with indexes, field kinds and a history policy to be used.
 *
 * TODO: actually implement
 * TODO: is history policy a detail of what indexes are used, or is there something else to it?
 */
export class SharedTreeCore<TEditor extends ChangeFamilyEditor, TChange> extends SharedObject {
	private readonly editManager: EditManager<TEditor, TChange, ChangeFamily<TEditor, TChange>>;
	private readonly summarizables: readonly Summarizable[];

	/** Iff false, calls to `submitOp` will have no effect */
	private submitOps = true;

	/**
	 * The sequence number that this instance is at.
	 * This is number is artificial in that it is made up by this instance as opposed to being provided by the runtime.
	 * Is `undefined` after (and only after) this instance is attached.
	 */
	private detachedRevision: SeqNumber | undefined = minimumPossibleSequenceNumber;

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	public get editor(): TEditor {
		return this.getLocalBranch().editor;
	}

	/**
	 * Used to encode/decode messages sent to/received from the Fluid runtime.
	 *
	 * @remarks Since there is currently only one format, this can just be cached on the class.
	 * With more write formats active, it may make sense to keep around the "usual" format codec
	 * (the one for the current persisted configuration) and resolve codecs for different versions
	 * as necessary (e.g. an upgrade op came in, or the configuration changed within the collab window
	 * and an op needs to be interpreted which isn't written with the current configuration).
	 */
	private readonly messageCodec: IJsonCodec<DecodedMessage<TChange>, unknown>;

	/**
	 * @param summarizables - Summarizers for all indexes used by this tree
	 * @param changeFamily - The change family
	 * @param editManager - The edit manager
	 * @param id - The id of the shared object
	 * @param runtime - The IFluidDataStoreRuntime which contains the shared object
	 * @param attributes - Attributes of the shared object
	 * @param telemetryContextPrefix - the context for any telemetry logs/errors emitted
	 */
	public constructor(
		summarizables: readonly Summarizable[],
		changeFamily: ChangeFamily<TEditor, TChange>,
		options: ICodecOptions,
		// Base class arguments
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		/**
		 * A random ID that uniquely identifies this client in the collab session.
		 * This is sent alongside every op to identify which client the op originated from.
		 * This is used rather than the Fluid client ID because the Fluid client ID is not stable across reconnections.
		 */
		// TODO: Change this type to be the Session ID type provided by the IdCompressor when available.
		const localSessionId = generateStableId();
		this.editManager = new EditManager(changeFamily, localSessionId);
		this.editManager.localBranch.on("afterChange", (args) => {
			const { type } = args;
			switch (type) {
				case "append":
					for (const c of args.newCommits) {
						if (!this.getLocalBranch().isTransacting()) {
							this.submitCommit(c);
						}
					}
					break;
				case "replace":
					if (getChangeReplaceType(args) === "transactionCommit") {
						if (!this.getLocalBranch().isTransacting()) {
							this.submitCommit(args.newCommits[0]);
						}
					}
					break;
				default:
					break;
			}
		});

		const revisionTagCodec = new RevisionTagCodec();
		this.summarizables = [
			new EditManagerSummarizer(this.editManager, revisionTagCodec, options),
			...summarizables,
		];
		assert(
			new Set(this.summarizables.map((e) => e.key)).size === this.summarizables.length,
			0x350 /* Index summary element keys must be unique */,
		);

		this.messageCodec = makeMessageCodec(
			changeFamily.codecs.resolve(formatVersion).json,
			new RevisionTagCodec(),
			options,
		);
	}

	// TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
	// We might want to not subclass it, or override/reimplement most of its functionality.
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		const summarizableBuilder = new SummaryTreeBuilder();
		// Merge the summaries of all summarizables together under a single ISummaryTree
		for (const s of this.summarizables) {
			summarizableBuilder.addWithStats(
				s.key,
				s.getAttachSummary(
					(contents) => serializer.stringify(contents, this.handle),
					undefined,
					undefined,
					telemetryContext,
				),
			);
		}

		builder.addWithStats(summarizablesTreeKey, summarizableBuilder.getSummaryTree());
		return builder.getSummaryTree();
	}

	protected async loadCore(services: IChannelStorageService): Promise<void> {
		const loadSummaries = this.summarizables.map(async (summaryElement) =>
			summaryElement.load(
				scopeStorageService(services, summarizablesTreeKey, summaryElement.key),
				(contents) => this.serializer.parse(contents),
			),
		);

		await Promise.all(loadSummaries);
	}

	/**
	 * Submits an op to the Fluid runtime containing the given commit
	 * @param commit - the commit to submit
	 */
	private submitCommit(commit: GraphCommit<TChange>): void {
		if (!this.submitOps) {
			return;
		}

		// Edits should not be submitted until all transactions finish
		assert(
			!this.getLocalBranch().isTransacting(),
			0x68b /* Unexpected edit submitted during transaction */,
		);

		// Edits submitted before the first attach are treated as sequenced because they will be included
		// in the attach summary that is uploaded to the service.
		// Until this attach workflow happens, this instance essentially behaves as a centralized data structure.
		if (this.detachedRevision !== undefined) {
			const newRevision: SeqNumber = brand((this.detachedRevision as number) + 1);
			this.detachedRevision = newRevision;
			this.editManager.addSequencedChange(
				{ ...commit, sessionId: this.editManager.localSessionId },
				newRevision,
				this.detachedRevision,
			);
		}
		const message = this.messageCodec.encode({
			commit,
			sessionId: this.editManager.localSessionId,
		});
		this.submitLocalMessage(this.serializer.encode(message, this.handle));
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		const contents: unknown = this.serializer.decode(message.contents);
		const { commit, sessionId } = this.messageCodec.decode(contents);

		this.editManager.addSequencedChange(
			{ ...commit, sessionId },
			brand(message.sequenceNumber),
			brand(message.referenceSequenceNumber),
		);

		this.editManager.advanceMinimumSequenceNumber(brand(message.minimumSequenceNumber));
	}

	/**
	 * @returns the head commit of the root local branch
	 */
	protected getLocalBranch(): SharedTreeBranch<TEditor, TChange> {
		return this.editManager.localBranch;
	}

	protected onDisconnect() {}

	protected override didAttach(): void {
		if (this.detachedRevision !== undefined) {
			this.detachedRevision = undefined;
		}
	}

	protected override reSubmitCore(content: JsonCompatibleReadOnly, localOpMetadata: unknown) {
		const {
			commit: { revision },
		} = this.messageCodec.decode(content);
		const [commit] = this.editManager.findLocalCommit(revision);
		this.submitCommit(commit);
	}

	protected applyStashedOp(content: JsonCompatibleReadOnly): undefined {
		assert(
			!this.getLocalBranch().isTransacting(),
			0x674 /* Unexpected transaction is open while applying stashed ops */,
		);
		const {
			commit: { revision, change },
		} = this.messageCodec.decode(content);
		this.submitOps = false;
		this.editManager.localBranch.apply(change, revision);
		this.submitOps = true;
		return;
	}

	public override getGCData(fullGC?: boolean): IGarbageCollectionData {
		const gcNodes: IGarbageCollectionData["gcNodes"] = super.getGCData(fullGC).gcNodes;
		for (const s of this.summarizables) {
			for (const [id, routes] of Object.entries(s.getGCData(fullGC).gcNodes)) {
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
 * Specifies the behavior of a component that puts data in a summary.
 */
export interface Summarizable {
	/**
	 * Field name in summary json under which this element stores its data.
	 */
	readonly key: string;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).getAttachSummary}
	 * @param stringify - Serializes the contents of the component (including {@link IFluidHandle}s) for storage.
	 */
	getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the component (including {@link IFluidHandle}s) for storage.
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
	 * Allows the component to perform custom loading. The storage service is scoped to this component and therefore
	 * paths in this component will not collide with those in other components, even if they are the same string.
	 * @param service - Storage used by the component
	 * @param parse - Parses serialized data from storage into runtime objects for the component
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
