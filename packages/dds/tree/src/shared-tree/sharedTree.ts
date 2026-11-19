/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter, performanceNow } from "@fluid-internal/client-utils";
import type { IFluidLoadable } from "@fluidframework/core-interfaces/internal";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor, StableId } from "@fluidframework/id-compressor";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import type {
	IChannelView,
	IFluidSerializer,
	SharedKernel,
} from "@fluidframework/shared-object-base/internal";
import { UsageError, type TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { lt } from "semver-ts";

import {
	type CodecTree,
	type CodecWriteOptions,
	type CodecWriteOptionsBeta,
	DependentFormatVersion,
	FluidClientVersion,
	FormatValidatorNoOp,
	type ICodecOptions,
} from "../codec/index.js";
import {
	type FieldKey,
	type GraphCommit,
	type JsonableTree,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type RevisionTag,
	RevisionTagCodec,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeTypeSet,
	detachedFieldIndexCodecBuilder,
	makeDetachedFieldIndex,
	moveToDetachedField,
} from "../core/index.js";
import {
	DefaultRevisionReplacer,
	DetachedFieldIndexSummarizer,
	FieldBatchDecodingContext,
	FieldKinds,
	ForestSummarizer,
	SchemaSummarizer,
	TreeCompressionStrategy,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	fieldBatchCodecBuilder,
	forestCodecBuilder,
	jsonableTreeFromFieldCursor,
	makeMitigatedChangeFamily,
	type FieldBatchEncodingContext,
	type IncrementalEncodingPolicy,
} from "../feature-libraries/index.js";
import { schemaCodecBuilder } from "../feature-libraries/index.js";
import {
	type BranchId,
	type ClonableSchemaAndPolicy,
	getCodecTreeForEditManagerFormatWithChange,
	getCodecTreeForMessageFormatWithChange,
	makeMessageCodecBuilder,
	type SharedTreeCoreOptionsInternal,
	MessageFormatVersion,
	messageCodecName,
	SharedTreeCore,
	EditManagerFormatVersion,
	makeEditManagerCodecBuilder,
	createHistoryCompactionStats,
	type HistoryCompactionRange,
	type HistoryCompactionStats,
	type HistoryTrace,
} from "../shared-tree-core/index.js";
import {
	type ImplicitFieldSchema,
	NodeKind,
	type ReadSchema,
	type SimpleFieldSchema,
	type SimpleTreeSchema,
	type TreeView,
	type TreeViewConfiguration,
	type UnsafeUnknownSchema,
	type VerboseTree,
	tryStoredSchemaAsArray,
	type SimpleNodeSchema,
	FieldKind,
	type ITreeAlpha,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This is referenced by doc comments.
	type ViewableTreeAlpha,
	type SimpleObjectFieldSchema,
	type SimpleAllowedTypeAttributes,
	type SchemaType,
	type PlanCompaction,
	type SummaryHistoryCompactionOptions,
	type CommitRevision,
	type TreeHistoryCompactionEvents,
} from "../simple-tree/index.js";
import {
	type Breakable,
	breakingClass,
	isJsonObject,
	type JsonCompatible,
	throwIfBroken,
} from "../util/index.js";

import type { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { buildConfiguredForest, type ForestType } from "./forestType.js";
import type {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	ForestTypeOptimized,
} from "./forestTypeOptimized.js";
import { ForestTypeReference } from "./forestTypeReference.js";
import { LazyTreeBranchCommitMetadata } from "./history.js";
import {
	getCodecTreeForChangeFormat,
	SharedTreeChangeFormatVersion,
} from "./sharedTreeChangeCodecs.js";
import type { SharedTreeChangeProcessingContext } from "./sharedTreeChangeFamily.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { type TreeCheckout, createTreeCheckout } from "./treeCheckout.js";
import { createViewableTreeAlpha } from "./viewableTree.js";

/**
 * Copy of data from an {@link ITreePrivate} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
 */
export interface SharedTreeContentSnapshot {
	/**
	 * The schema stored in the document.
	 *
	 * @remarks
	 * Edits to the schema can mutate the schema stored of the tree which took this snapshot (but this snapshot will remain the same)
	 * This is mainly useful for debugging cases where schematize reports an incompatible view schema.
	 */
	readonly schema: TreeStoredSchema;
	/**
	 * All {@link TreeStatus.InDocument} content.
	 */
	readonly tree: JsonableTree[];
	/**
	 * All {@link TreeStatus.Removed} content.
	 */
	readonly removed: [string | number | undefined, number, JsonableTree][];
}

/**
 * {@link ITree} extended with some non-public APIs.
 * @internal
 */
export interface ITreeInternal extends IChannelView, ITreeAlpha {}

/**
 * {@link ITreeInternal} extended with some non-exported APIs.
 * @remarks
 * This allows access to the tree content using the internal data model used at the storage and "flex" layers,
 * and should only be needed for testing and debugging this package's internals.
 */
export interface ITreePrivate extends ITreeInternal {
	/**
	 * Provides a copy of the current content of the tree.
	 * This can be useful for inspecting the tree when no suitable view schema is available.
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 *
	 * This does not include everything that is included in a tree summary, since information about how to merge future edits is omitted.
	 */
	contentSnapshot(): SharedTreeContentSnapshot;

	/**
	 * Access to internals for testing.
	 */
	readonly kernel: SharedTreeKernel;
}

/**
 * The type SharedTree's kernel's view must implement so what when its merged with the underling SharedObject's API it fully implements the required tree API surface ({@link ITreePrivate }).
 */
export type SharedTreeKernelView = Omit<ITreePrivate, keyof (IChannelView & IFluidLoadable)>;

/**
 * SharedTreeCore, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
@breakingClass
export class SharedTreeKernel
	extends SharedTreeCore<
		SharedTreeEditBuilder,
		SharedTreeChange,
		SharedTreeChangeProcessingContext
	>
	implements SharedKernel
{
	public readonly checkout: TreeCheckout;
	public get storedSchema(): TreeStoredSchemaRepository {
		return this.checkout.storedSchema;
	}

	private readonly checkouts: Map<BranchId, TreeCheckout> = new Map();

	/**
	 * Compaction policy run before each summary, from {@link SharedTreeOptions.historyCompaction}.
	 */
	private readonly summaryCompactionPlan: PlanCompaction | undefined;

	/**
	 * Whether this tree writes the message format that can carry preserved revisions.
	 * @remarks See {@link SummaryHistoryCompactionOptions.enableRevisionPreservation}.
	 */
	private readonly supportsRevisionPreservation: boolean;

	private readonly historyCompactionEvents = createEmitter<TreeHistoryCompactionEvents>();

	/**
	 * The app-facing API for SharedTree implemented by this Kernel.
	 * @remarks
	 * This is the API grafted onto the ISharedObject which apps can access.
	 * It includes both the APIs used for internal testing, and public facing APIs (both stable and unstable).
	 * Different users will have access to different subsets of this API, see {@link ITree}, {@link ITreeAlpha} and {@link ITreeInternal} which this {@link ITreePrivate} extends.
	 */
	public readonly view: SharedTreeKernelView;

	public constructor(
		breaker: Breakable,
		sharedObject: IChannelView & IFluidLoadable,
		serializer: IFluidSerializer,
		submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void,
		lastSequenceNumber: () => number | undefined,
		initialSequenceNumber: number,
		idCompressor: IIdCompressor,
		optionsParam: SharedTreeOptionsInternal,
		private readonly getIsSummarizerClient: () => boolean = () => false,
	) {
		const retainHistory = optionsParam.retainHistory;
		if (
			retainHistory !== undefined &&
			typeof retainHistory !== "boolean" &&
			(!Number.isSafeInteger(retainHistory) || retainHistory < 0)
		) {
			throw new UsageError("retainHistory must be a boolean or a nonnegative safe integer");
		}
		const options: Required<Omit<SharedTreeOptionsInternal, "historyCompaction">> = {
			...defaultSharedTreeOptions,
			...optionsParam,
			retainHistory: retainHistory ?? defaultSharedTreeOptions.retainHistory,
		};
		if (lt(options.minVersionForCollab, FluidClientVersion.v2_0)) {
			throw new UsageError("SharedTree requires minVersionForCollab of at least 2.0.0");
		}
		const schema = new TreeStoredSchemaRepository();
		const forest = buildConfiguredForest(
			breaker,
			options.forest,
			schema,
			idCompressor,
			options.shouldEncodeIncrementally,
		);
		const removedRoots = makeDetachedFieldIndex("repair");
		const schemaCodec = schemaCodecBuilder.build(options);
		const schemaSummarizer = new SchemaSummarizer(
			schema,
			{
				getCurrentSeq: lastSequenceNumber,
			},
			schemaCodec,
			options.minVersionForCollab,
		);
		const fieldBatchCodec = fieldBatchCodecBuilder.build(options);

		const encoderContext: FieldBatchEncodingContext = {
			schema: {
				schema,
				policy: defaultSchemaPolicy,
			},
			encodeType: options.treeEncodeType,
			idCompressor,
			// ForestSummarizer is the only consumer of this context, and it
			// only invokes the codec in summary encode / load paths.
			isSummary: true,
		};
		const decoderContext = FieldBatchDecodingContext.forSummary({
			idCompressor,
			healing:
				options.healUnresolvableIdentifiersOnDecode === true
					? { sharedObjectId: sharedObject.id, logger: breaker.logger }
					: undefined,
		});
		const forestSummarizer = new ForestSummarizer(
			forest,
			schemaSummarizer,
			encoderContext,
			decoderContext,
			options,
			idCompressor,
			initialSequenceNumber,
			options.shouldEncodeIncrementally,
		);
		const revisionTagCodec = new RevisionTagCodec(idCompressor);
		const removedRootsSummarizer = new DetachedFieldIndexSummarizer(
			removedRoots,
			revisionTagCodec,
			idCompressor,
			options,
		);
		const innerChangeFamily = new SharedTreeChangeFamily(
			revisionTagCodec,
			fieldBatchCodec,
			options,
			options.treeEncodeType,
			idCompressor,
		);
		const changeFamily = makeMitigatedChangeFamily(
			innerChangeFamily,
			SharedTreeChangeFamily.emptyChange,
			(error: unknown) => {
				// TODO:6344 Add telemetry for these errors.
				// Rethrowing the error has a different effect depending on the context in which the
				// ChangeFamily was invoked:
				// - If the ChangeFamily was invoked as part of incoming op processing, rethrowing the error
				// will cause the runtime to disconnect the client, log a severe error, and not reconnect.
				// This will not cause the host application to crash because it is not on the stack at that time.
				// TODO: let the host application know that the client is now disconnected.
				// - If the ChangeFamily was invoked as part of dealing with a local change, rethrowing the
				// error will cause the host application to crash. This is not ideal, but is better than
				// letting the application either send an invalid change to the server or allowing the
				// application to continue working when its local branches contain edits that cannot be
				// reflected in its views.
				// The best course of action for a host application in such a state is to restart.
				// TODO: let the host application know about this situation and provide a way to
				// programmatically reload the SharedTree container.
				throw error;
			},
		);
		super(
			breaker,
			sharedObject,
			serializer,
			submitLocalMessage,
			[schemaSummarizer, forestSummarizer, removedRootsSummarizer],
			changeFamily,
			options,
			changeFormatVersionForEditManager,
			changeFormatVersionForMessage,
			idCompressor,
			schema,
			defaultSchemaPolicy,
			undefined,
			undefined,
			getIsSummarizerClient,
		);

		this.checkout = createTreeCheckout(idCompressor, this.mintRevisionTag, revisionTagCodec, {
			branch: this.getLocalBranch(),
			changeFamily,
			schema,
			forest,
			fieldBatchCodec,
			removedRoots,
			chunkCompressionStrategy: options.treeEncodeType,
			codecOptions: options,
			getFinalizedCommit: () => this.getTrunkHead(),
		});

		this.registerSharedBranchForEditing("main", this.checkout);
		this.registerCheckout("main", this.checkout);

		this.view = {
			...createViewableTreeAlpha(this.checkout, () => this.exportSimpleSchema()),
			get storedSchemaVersion() {
				return schema.schemaVersion;
			},
			contentSnapshot: () => this.contentSnapshot(),
			viewSharedBranchWith: this.viewBranchWith.bind(this),
			createSharedBranch: this.createSharedBranch.bind(this),
			getSharedBranchName: this.getSharedBranchName.bind(this),
			getSharedBranchIds: this.getSharedBranchIds.bind(this),
			historyCompaction: {
				requestPlannedCompaction: (planCompaction) =>
					this.runPlannedCompaction(planCompaction, "manual"),
				setRevisionPreserved: (revision, preserved) =>
					this.setCommitRevisionPreserved(revision, preserved),
				isRevisionPreserved: (revision) => this.isCommitRevisionPreserved(revision),
				events: this.historyCompactionEvents,
			},
			kernel: this,
		};
		this.summaryCompactionPlan = optionsParam.historyCompaction?.planCompaction;
		this.supportsRevisionPreservation =
			options.writeVersionOverrides.get(messageCodecName) ===
			MessageFormatVersion.vHistoryCompaction;
		this.historyTrace?.record("HistoryConfigured", {
			retainHistory: options.retainHistory,
			summaryPolicyConfigured: this.summaryCompactionPlan !== undefined,
			revisionPreservationEnabled: this.supportsRevisionPreservation,
		});
	}

	// Usage errors are reported before any state changes, so they do not need to break the tree.
	@throwIfBroken
	private setCommitRevisionPreserved(revision: CommitRevision, preserved: boolean): void {
		this.historyTrace?.record("PreservationRequested", { preserved });
		if (!this.supportsRevisionPreservation) {
			this.historyTrace?.record("PreservationRequestFailed", {
				reason: "notEnabled",
			});
			throw new UsageError(
				"setRevisionPreserved requires SharedTreeOptions.historyCompaction.enableRevisionPreservation (and is not supported with shared branches or detached-root editing)",
			);
		}
		const tag = this.idCompressor.tryRecompress(revision as StableId);
		if (tag === undefined) {
			if (!preserved) {
				this.historyTrace?.record("PreservationRequestIgnored", {
					reason: "unknownRevision",
					preserved,
				});
				return;
			}
			this.historyTrace?.record("PreservationRequestFailed", {
				reason: "unknownRevision",
			});
			throw new UsageError(`Unknown revision: ${revision}`);
		}
		if (!this.setRevisionPreserved(tag, preserved)) {
			this.historyTrace?.record("PreservationRequestFailed", {
				reason: "revisionNotInHistory",
			});
			throw new UsageError(
				`Revision ${revision} cannot be preserved because it is not in the main branch's history`,
			);
		}
	}

	protected override isSummarizerClient(): boolean {
		return this.getIsSummarizerClient();
	}

	protected override onRevisionPreservationRejected(revision: RevisionTag): void {
		assert(revision !== "root", "The root revision cannot be preserved");
		this.historyCompactionEvents.emit(
			"revisionPreservationRejected",
			this.idCompressor.decompress(revision) as CommitRevision,
		);
	}

	@throwIfBroken
	private isCommitRevisionPreserved(revision: CommitRevision): boolean {
		const tag = this.idCompressor.tryRecompress(revision as StableId);
		const preserved = tag !== undefined && this.isRevisionPreserved(tag);
		this.historyTrace?.record("PreservationQueried", { preserved });
		return preserved;
	}

	public override summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
		fullTree?: boolean,
	): ISummaryTreeWithStats {
		const operationId = this.historyTrace?.nextOperationId();
		this.historyTrace?.record("SummaryStarted", { operationId });
		try {
			this.compactHistoryForSummary(operationId);
			const summary = super.summarizeCore(
				serializer,
				telemetryContext,
				incrementalSummaryContext,
				fullTree,
			);
			this.historyTrace?.record("SummaryCompleted", { operationId });
			return summary;
		} catch (error: unknown) {
			this.historyTrace?.record("SummaryFailed", { operationId });
			throw error;
		}
	}

	/**
	 * Runs the configured summary compaction policy, if any.
	 * @remarks
	 * A faulty policy must not block summarization or break the tree.
	 * {@link SharedTreeKernel.runPlannedCompaction} only logs planning errors for summary passes, and never lets them break the tree.
	 */
	private compactHistoryForSummary(summaryOperationId?: number): void {
		const plan = this.summaryCompactionPlan;
		if (plan === undefined) {
			this.historyTrace?.record("CompactionSkipped", {
				summaryOperationId,
				trigger: "summary",
				reason: "noPolicyConfigured",
			});
			return;
		}
		this.runPlannedCompaction(plan, "summary", summaryOperationId);
	}

	/**
	 * Runs a "whole branch history" compaction pass: the application plans ranges, and each range is composed once.
	 * @remarks
	 * The plan is read and validated before anything changes, so a policy error or malformed plan leaves the history unchanged.
	 * Planning errors are rethrown for manual passes and only logged for summary passes.
	 * Either way, they are rethrown (if at all) only after the engine call returns, so they do not break the tree.
	 * Errors from the engine itself break the tree, because the history may have been partially rewritten.
	 */
	@throwIfBroken
	private runPlannedCompaction(
		planCompaction: PlanCompaction,
		trigger: "manual" | "summary",
		summaryOperationId?: number,
	): number {
		const started = performanceNow();
		const statistics = {
			removedCount: 0,
			policyCallCount: 0,
			defaultMergeCount: 0,
			replacementMergeCount: 0,
			// Total serialized size of the metadata in the plan, to monitor metadata growth.
			replacementMetadataLength: 0,
			// Total time spent in the application's policy, in milliseconds.
			policyDurationMs: 0,
			historyCommitCount: 0,
		};
		const passStats = createHistoryCompactionStats();
		let failureSource: "policy" | "plan" | "engine" | undefined;
		let engineError: unknown;
		// Planning errors are rethrown after the engine call returns, so that they do not break the tree:
		// nothing has changed when planning fails.
		let planningError: { readonly error: unknown } | undefined;
		const operationId = this.historyTrace?.nextOperationId();
		this.historyTrace?.record("CompactionStarted", {
			operationId,
			summaryOperationId,
			trigger,
		});
		try {
			statistics.removedCount = this.compactHistoryByPlan(
				(history, eligibleCount) => {
					statistics.policyCallCount++;
					statistics.historyCommitCount = history.length;
					const policyStarted = performanceNow();
					let ranges: HistoryCompactionRange[];
					try {
						ranges = planCompactionRanges(
							history,
							eligibleCount,
							this.idCompressor,
							planCompaction,
						);
					} catch (error: unknown) {
						failureSource = error instanceof UsageError ? "plan" : "policy";
						this.historyTrace?.record("CompactionPolicyFailed", {
							operationId,
							policyCallCount: statistics.policyCallCount,
							failureSource,
						});
						if (trigger === "manual") {
							planningError = { error };
						}
						return [];
					} finally {
						statistics.policyDurationMs += performanceNow() - policyStarted;
					}
					for (const range of ranges) {
						if (range.metadata !== undefined) {
							statistics.replacementMetadataLength += JSON.stringify(
								range.metadata.metadata,
							).length;
						}
					}
					return ranges;
				},
				(updated, obsolete) => new DefaultRevisionReplacer(updated, obsolete),
				(range) => {
					if (range.metadata === undefined) {
						statistics.defaultMergeCount++;
					} else {
						statistics.replacementMergeCount++;
					}
				},
				passStats,
				operationId,
			);
			if (planningError !== undefined) {
				throw planningError.error;
			}
			return statistics.removedCount;
		} catch (error: unknown) {
			if (failureSource === undefined) {
				failureSource = "engine";
				engineError = error;
			}
			throw error;
		} finally {
			reportCompaction(
				this.breaker.logger,
				this.historyTrace,
				operationId,
				trigger,
				started,
				failureSource,
				engineError,
				{ ...statistics, ...passStats },
			);
		}
	}

	private registerCheckout(branchId: BranchId, checkout: TreeCheckout): void {
		if (branchId === "main") {
			checkout.setLocationRevisionSource(() => ({
				head: this.getTrunkHead(),
				isAttached: this.sharedObject.isAttached(),
			}));
		}
		this.checkouts.set(branchId, checkout);
	}

	public exportVerbose(): VerboseTree | undefined {
		return this.checkout.exportVerbose();
	}

	public exportSimpleSchema(): SimpleTreeSchema {
		return exportSimpleSchema(this.storedSchema);
	}

	@throwIfBroken
	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.checkout.forest.allocateCursor("contentSnapshot");
		try {
			moveToDetachedField(this.checkout.forest, cursor);
			return {
				schema: this.storedSchema.clone(),
				tree: jsonableTreeFromFieldCursor(cursor),
				removed: this.checkout.getRemovedRoots(),
			};
		} finally {
			cursor.free();
		}
	}

	// For the new TreeViewAlpha API
	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>>;

	// For the old TreeView API
	public viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<TRoot>;

	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>> {
		return this.checkout.viewWith(config) as SchematizingSimpleTreeView<TRoot> &
			TreeView<ReadSchema<TRoot>>;
	}

	public viewBranchWith<TRoot extends ImplicitFieldSchema>(
		branchId: string,
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;

	public viewBranchWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		branchId: string,
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>> {
		const compressedId = this.idCompressor.tryRecompress(branchId as StableId);
		if (compressedId === undefined) {
			throw new UsageError(`No branch found with id: ${branchId}`);
		}
		return this.getCheckout(compressedId).viewWith(
			config,
		) as SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>>;
	}

	private getCheckout(branchId: BranchId): TreeCheckout {
		return this.checkouts.get(branchId) ?? this.checkoutBranch(branchId);
	}

	private checkoutBranch(branchId: BranchId): TreeCheckout {
		const checkout = this.checkout.fork();
		checkout.switchBranch(this.getSharedBranch(branchId));
		this.registerSharedBranchForEditing(branchId, checkout);
		this.registerCheckout(branchId, checkout);
		return checkout;
	}

	public override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this.checkout.load();
	}

	public override didAttach(): void {
		for (const checkout of this.checkouts.values()) {
			if (checkout.transaction.size > 0) {
				// Attaching during a transaction is not currently supported.
				// At least part of of the system is known to not handle this case correctly - commit enrichment - and there may be others.
				throw new UsageError(
					"Cannot attach while a transaction is in progress. Commit or abort the transaction before attaching.",
				);
			}
		}
		super.didAttach();
	}

	public override applyStashedOp(
		...args: Parameters<
			SharedTreeCore<
				SharedTreeEditBuilder,
				SharedTreeChange,
				SharedTreeChangeProcessingContext
			>["applyStashedOp"]
		>
	): void {
		for (const checkout of this.checkouts.values()) {
			assert(
				checkout.transaction.size === 0,
				0x674 /* Unexpected transaction is open while applying stashed ops */,
			);
		}
		super.applyStashedOp(...args);
	}

	protected override submitCommit(
		branchId: BranchId,
		commit: GraphCommit<SharedTreeChange>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
		isResubmit: boolean,
	): void {
		const checkout = this.getCheckout(branchId);
		assert(
			checkout.transaction.size === 0,
			0xaa6 /* Cannot submit a commit while a transaction is in progress */,
		);
		if (isResubmit) {
			return super.submitCommit(branchId, commit, schemaAndPolicy, isResubmit);
		}

		// Refrain from submitting new commits until they are validated by the checkout.
		// This is not a strict requirement for correctness in our system, but in the event that there is a bug when applying commits to the checkout
		// that causes a crash (e.g. in the forest), this will at least prevent this client from sending the problematic commit to any other clients.
		checkout.onCommitValid(commit, () =>
			super.submitCommit(branchId, commit, schemaAndPolicy, isResubmit),
		);
	}

	public onDisconnect(): void {}
}

export function exportSimpleSchema(
	storedSchema: TreeStoredSchema,
): SimpleTreeSchema<SchemaType.Stored> {
	return {
		...(storedSchema.schemaVersion === undefined
			? {}
			: { schemaVersion: storedSchema.schemaVersion }),
		root: exportSimpleFieldSchemaStored(storedSchema.rootFieldSchema),
		definitions: new Map(
			[...storedSchema.nodeSchema].map(([key, schema]) => {
				return [key, exportSimpleNodeSchemaStored(schema)];
			}),
		),
	};
}

/**
 * A way to parse schema in the persisted format from {@link extractPersistedSchema}.
 * @remarks
 * This behaves identically to {@link ViewableTreeAlpha.exportSimpleSchema},
 * except that it gets the schema from the caller instead of from an existing tree.
 *
 * This can be useful for inspecting the contents of persisted schema,
 * such as those generated by {@link extractPersistedSchema} for use in testing.
 * Since that data format is otherwise unspecified,
 * this provides a way to inspect its contents with documented semantics.
 * @alpha
 */
export function persistedToSimpleSchema(
	persisted: JsonCompatible,
	options: ICodecOptions,
): SimpleTreeSchema {
	const schemaCodec = schemaCodecBuilder.buildDecoder(options);
	const stored = schemaCodec.decode(persisted);
	return exportSimpleSchema(stored);
}

/**
 * Defines for each EditManagerFormatVersion the SharedTreeChangeFormatVersion to use.
 * This is an arbitrary mapping that is injected in the EditManger codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for SharedTree changes are not explicitly versioned.
 */
export const changeFormatVersionForEditManager = DependentFormatVersion.fromPairs<
	EditManagerFormatVersion,
	SharedTreeChangeFormatVersion
>([
	[EditManagerFormatVersion.v3, SharedTreeChangeFormatVersion.v3],
	[EditManagerFormatVersion.v4, SharedTreeChangeFormatVersion.v4],
	[EditManagerFormatVersion.vSharedBranches, SharedTreeChangeFormatVersion.v4],
	[EditManagerFormatVersion.v6, SharedTreeChangeFormatVersion.v5],
	[EditManagerFormatVersion.v7, SharedTreeChangeFormatVersion.v5],
	[EditManagerFormatVersion.vDetachedRoots, SharedTreeChangeFormatVersion.vDetachedRoots],
	[EditManagerFormatVersion.vHistoryCompaction, SharedTreeChangeFormatVersion.v5],
]);

/**
 * Defines for each MessageFormatVersion the SharedTreeChangeFormatVersion to use.
 * This is an arbitrary mapping that is injected in the message codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for SharedTree changes are not explicitly versioned.
 */
export const changeFormatVersionForMessage = DependentFormatVersion.fromPairs<
	MessageFormatVersion,
	SharedTreeChangeFormatVersion
>([
	[MessageFormatVersion.v3, SharedTreeChangeFormatVersion.v3],
	[MessageFormatVersion.v4, SharedTreeChangeFormatVersion.v4],
	[MessageFormatVersion.vSharedBranches, SharedTreeChangeFormatVersion.v4],
	[MessageFormatVersion.v6, SharedTreeChangeFormatVersion.v5],
	[MessageFormatVersion.v7, SharedTreeChangeFormatVersion.v5],
	[MessageFormatVersion.vDetachedRoots, SharedTreeChangeFormatVersion.vDetachedRoots],
	[MessageFormatVersion.vHistoryCompaction, SharedTreeChangeFormatVersion.v5],
]);

function getCodecTreeForEditManagerFormat(
	clientVersion: OldestSupportedClientVersion,
): CodecTree {
	const editManagerVersion = makeEditManagerCodecBuilder().getCodecTree(clientVersion).version;
	const change = changeFormatVersionForEditManager.lookup(editManagerVersion);
	const changeCodecTree = getCodecTreeForChangeFormat(change, clientVersion);
	return getCodecTreeForEditManagerFormatWithChange(clientVersion, changeCodecTree);
}

function getCodecTreeForMessageFormat(clientVersion: OldestSupportedClientVersion): CodecTree {
	const messageVersion = makeMessageCodecBuilder().getCodecTree(clientVersion).version;
	assert(
		messageVersion !== undefined,
		0xce3 /* Deprecated 'undefined' version shouldn't be selected */,
	);
	const change = changeFormatVersionForMessage.lookup(messageVersion);
	const changeCodecTree = getCodecTreeForChangeFormat(change, clientVersion);
	return getCodecTreeForMessageFormatWithChange(clientVersion, changeCodecTree);
}

export function getCodecTreeForSharedTreeFormat(
	clientVersion: OldestSupportedClientVersion,
): CodecTree {
	const children: CodecTree[] = [];
	children.push(forestCodecBuilder.getCodecTree(clientVersion));
	children.push(schemaCodecBuilder.getCodecTree(clientVersion));
	children.push(detachedFieldIndexCodecBuilder.getCodecTree(clientVersion));
	children.push(getCodecTreeForEditManagerFormat(clientVersion));
	children.push(getCodecTreeForMessageFormat(clientVersion));
	children.push(fieldBatchCodecBuilder.getCodecTree(clientVersion));
	return {
		name: "SharedTree",
		version: undefined, // SharedTree does not have a version of its own.
		children,
	};
}

/**
 * Configuration options for SharedTree.
 * @beta @input
 */
export interface SharedTreeOptionsBeta extends ForestOptions, Partial<CodecWriteOptionsBeta> {
	/**
	 * When `true`, when an improperly encoded identifier is encountered in a summary,
	 * a new identifier will be generated instead of throwing an error.
	 *
	 * @defaultValue `false`
	 *
	 * @remarks
	 * The intended use is recovering documents whose attach summary was persisted
	 * with unresolvable node identifiers (a SharedTree-attaches-to-already-attached-container
	 * scenario). Without this flag enabled, a client opening such a document will throw at summary load time.
	 * With this flag enabled, unresolvable identifiers are replaced at decode time with stable UUIDs
	 * derived deterministically from the data store id and the unresolvable op-space integer,
	 * so every reader of the same blob (other than the originator) agrees on the resulting in-memory id.
	 * Healed identifiers are written back out at the next summary in their stable UUID form,
	 * so the inconsistency does not need to be re-healed on every load.
	 *
	 * When this flag is enabled, each time an unresolvable identifier is healed a
	 * `HealUnresolvableIdentifierOnDecode` telemetry event is emitted (at
	 * {@link @fluidframework/core-interfaces#LogLevelConst.info | LogLevel.info}) through the shared
	 * object's logger, allowing applications to detect which documents actually required healing.
	 *
	 * Off by default because enabling it for documents that are not actually corrupt
	 * would mask genuine bugs that otherwise surface as decode failures.
	 *
	 * This mitigation is also not perfect as the client that originated the non-finalized
	 * will not apply the same "healing" and will continue to use the original identifier.
	 * The difference in identifiers between the originating client and subsequent clients that load
	 * the document is not ideal but generally benign to Fluid. However, it may have application-level
	 * consequences (e.g. if the application stores the identifiers elsewhere, either in other parts of
	 * Fluid data or externally). Applications should consider whether this risk is acceptable before
	 * enabling this option.
	 *
	 * @privateRemarks
	 * "Unresolvable" in the public-facing remarks corresponds to non-finalized short IDs persisted without
	 * any corresponding context for their originating session. See id-compressor internal documentation
	 * for more details.
	 *
	 * Internally this boolean is translated into {@link IdentifierHealingConfig} once the shared-object
	 * id is known (in `SharedTreeCore`'s constructor) and threaded through the codec contexts as a
	 * single `healing?` field from there on. The presence/absence of that config is the heal-on/heal-off
	 * discriminator inside the codec layer.
	 */
	readonly healUnresolvableIdentifiersOnDecode?: boolean;
}

/**
 * Configuration options for SharedTree with alpha features.
 * @alpha @input
 */
export interface SharedTreeOptions
	extends SharedTreeOptionsBeta,
		Partial<CodecWriteOptions>,
		Partial<SharedTreeFormatOptions> {
	/**
	 * Experimental feature flag to enable shared branches.
	 * This feature is not yet complete and should not be used in production.
	 * Defaults to false.
	 */
	readonly enableSharedBranches?: boolean;
	/**
	 * Experimental feature flag to enable the ability to edit detached roots.
	 * @remarks This feature is not yet complete and should not be used in production.
	 * @defaultValue `false`
	 */
	readonly enableDetachedRootEditing?: boolean;
	/**
	 * Returns whether a node / field should be incrementally encoded.
	 * @remarks
	 * See {@link IncrementalEncodingPolicy}.
	 */
	shouldEncodeIncrementally?: IncrementalEncodingPolicy;

	/**
	 * Configures the minimum amount of available sequenced edit history this SharedTree instance retains.
	 *
	 * @defaultValue `false`
	 *
	 * @remarks
	 * A positive safe integer retains the newest specified number of available main-branch commits.
	 * Each sequenced commit counts separately, including commits in the same batch.
	 * Set to `true` to retain all available history, or `false` or `0` to disable extra retention.
	 * Collaboration and existing branches can require retaining additional commits, so the policy is not a hard cap. There are two other situations that can cause the number of retained commits to temporarily exceed the limit set by the policy:
	 * - While the container is detached, commits are only trimmed when a summary is generated.
	 * - When a summary is loaded, no trimming is performed until the client receives information about the current collaboration window from the service.
	 *
	 * This policy is local to each SharedTree instance; it is not stored in the document or propagated to other clients.
	 * Increasing retention cannot recover history that has already been removed.
	 * By default, SharedTree evicts trunk commits once all peers have acknowledged them (i.e. once they
	 * are outside the collaboration window), and they are not otherwise retained (e.g. by revertibles or
	 * local branches), to bound memory usage and document size.
	 * Setting this option to `true` retains all available trunk commits - this increases memory usage and document size
	 * over time and should be used with care.
	 */
	readonly retainHistory?: boolean | number;

	/**
	 * When `true`, validates that commits being submitted for the first time can be applied without errors to a view.
	 * In the event that a commit cannot be applied, SharedTree will throw an error and will enter a "broken" state, preventing the offending commit (and any further commits) from being submitted.
	 *
	 * This can be enabled (at the cost of performance) to improve safety against document corruption in the event of a bug in the SharedTree code:
	 * when the additional validation is enabled, a client will error instead of potentially corrupting the document.
	 *
	 * @defaultValue `false`
	 *
	 * @remarks
	 * This validation is more expensive than {@link SharedTreeOptions.validateRebasedCommitsBeforeResubmission} because it is likely to be performed more often.
	 * We recommend {@link ForestOptions.forest|configuring SharedTree} with the {@link ForestTypeOptimized|optimized forest implementation} to reduce its performance impact.
	 */
	readonly validateCommitsOnFirstSubmission?: boolean;

	/**
	 * When `true`, validates that the commits being resubmitted can be applied without errors to a view.
	 * In the event that a commit cannot be applied, SharedTree will throw an error and will enter a "broken" state, preventing the offending commit (and any further commits) from being submitted.
	 *
	 * This can be enabled (at the cost of performance) to improve safety against document corruption in the event of a bug in the SharedTree code:
	 * when the additional validation is enabled, a client will error instead of potentially corrupting the document.
	 *
	 * @defaultValue `false`
	 *
	 * @remarks
	 * We recommend {@link ForestOptions.forest|configuring SharedTree} with the {@link ForestTypeOptimized|optimized forest implementation} to reduce the performance impact of this validation.
	 */
	readonly validateRebasedCommitsBeforeResubmission?: boolean;

	/**
	 * Application-guided history compaction that runs each time this SharedTree writes a summary.
	 *
	 * @defaultValue `undefined` (no compaction when summarizing)
	 *
	 * @remarks
	 * Only has an effect when {@link SharedTreeOptions.retainHistory} keeps history beyond the collaboration window.
	 * Like `retainHistory`, this option is local to each SharedTree instance; it is not stored in the document.
	 * Because the summarizer client is created from the same application code, it receives the same policy,
	 * and the compacted history is what gets persisted.
	 * See {@link SummaryHistoryCompactionOptions}.
	 */
	readonly historyCompaction?: SummaryHistoryCompactionOptions;
}

export interface SharedTreeOptionsInternal
	extends SharedTreeOptions,
		Partial<SharedTreeCoreOptionsInternal> {}

/**
 * Configuration options for SharedTree's internal tree storage.
 * @beta @input
 */
export interface ForestOptions {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	readonly forest?: ForestType;
}

/**
 * Options for configuring the persisted format SharedTree uses.
 * @alpha @input
 */
export interface SharedTreeFormatOptions {
	/**
	 * See {@link TreeCompressionStrategy}.
	 * default: TreeCompressionStrategy.Compressed
	 */
	treeEncodeType: TreeCompressionStrategy;
}

export const defaultSharedTreeOptions: Required<
	Omit<SharedTreeOptionsInternal, "historyCompaction">
> = {
	jsonValidator: FormatValidatorNoOp,
	minVersionForCollab: FluidClientVersion.v2_0,
	forest: ForestTypeReference,
	treeEncodeType: TreeCompressionStrategy.Compressed,
	shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
	enableSharedBranches: false,
	healUnresolvableIdentifiersOnDecode: false,
	writeVersionOverrides: new Map(),
	allowPossiblyIncompatibleWriteVersionOverrides: false,
	retainHistory: false,
	validateCommitsOnFirstSubmission: false,
	validateRebasedCommitsBeforeResubmission: false,
	enableDetachedRootEditing: false,
};

/**
 * Build the allowed types for a Stored Schema.
 *
 * @remarks Staged upgrades do not apply to stored schemas, so we omit the {@link SimpleAllowedTypeAttributes.isStaged | staging flag } when building {@link SimpleAllowedTypeAttributes}.
 * @param types - The types to create allowed types for.
 * @returns The allowed types.
 */
function buildSimpleAllowedTypeAttributesForStoredSchema(
	types: TreeTypeSet,
): ReadonlyMap<string, SimpleAllowedTypeAttributes<SchemaType.Stored>> {
	const allowedTypesInfo = new Map<string, SimpleAllowedTypeAttributes<SchemaType.Stored>>();
	for (const type of types) {
		// Stored schemas do not have staged upgrades
		allowedTypesInfo.set(type, { isStaged: undefined });
	}
	return allowedTypesInfo;
}

function exportSimpleFieldSchemaStored(
	schema: TreeFieldStoredSchema,
): SimpleFieldSchema<SchemaType.Stored> {
	let kind: FieldKind;
	switch (schema.kind) {
		case FieldKinds.identifier.identifier: {
			kind = FieldKind.Identifier;
			break;
		}
		case FieldKinds.optional.identifier: {
			kind = FieldKind.Optional;
			break;
		}
		case FieldKinds.required.identifier: {
			kind = FieldKind.Required;
			break;
		}
		case FieldKinds.forbidden.identifier: {
			kind = FieldKind.Optional;
			assert(schema.types.size === 0, 0xa94 /* invalid forbidden field */);
			break;
		}
		default: {
			fail(0xaca /* invalid field kind */);
		}
	}
	return {
		kind,
		simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(schema.types),
		metadata: {},
		persistedMetadata: schema.persistedMetadata,
	};
}

/**
 * Export a {@link SimpleNodeSchema} from a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 * Note on SimpleNodeSchema construction: In the persisted format `persistedMetadata` is just called `metadata` whereas the `metadata`
 * field on SimpleNodeSchema is not persisted.
 */
function exportSimpleNodeSchemaStored(
	schema: TreeNodeStoredSchema,
): SimpleNodeSchema<SchemaType.Stored> {
	const arrayTypes = tryStoredSchemaAsArray(schema);
	if (arrayTypes !== undefined) {
		return {
			kind: NodeKind.Array,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(arrayTypes),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof ObjectNodeStoredSchema) {
		const fields = new Map<FieldKey, SimpleObjectFieldSchema<SchemaType.Stored>>();
		for (const [storedKey, field] of schema.objectNodeFields) {
			fields.set(storedKey, { ...exportSimpleFieldSchemaStored(field), storedKey });
		}
		return {
			kind: NodeKind.Object,
			fields,
			allowUnknownOptionalFields: undefined,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof MapNodeStoredSchema) {
		assert(
			schema.mapFields.kind === FieldKinds.optional.identifier,
			0xa95 /* Invalid map schema */,
		);
		return {
			kind: NodeKind.Map,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(
				schema.mapFields.types,
			),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof LeafNodeStoredSchema) {
		return {
			kind: NodeKind.Leaf,
			leafKind: schema.leafValue,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	fail(0xacb /* invalid schema kind */);
}

/**
 * Records the outcome of a compaction pass as a history trace event and a `HistoryCompaction` telemetry event.
 * @remarks
 * Not a method of {@link SharedTreeKernel}, because it runs after a failed pass may have broken the tree.
 */
function reportCompaction(
	logger: TelemetryLoggerExt | undefined,
	historyTrace: HistoryTrace | undefined,
	operationId: number | undefined,
	trigger: "manual" | "summary",
	started: number,
	failureSource: "policy" | "plan" | "engine" | undefined,
	engineError: unknown,
	statistics: HistoryCompactionStats & Record<string, number>,
): void {
	const durationMs = performanceNow() - started;
	const status = failureSource === undefined ? "success" : "failure";
	historyTrace?.record("CompactionCompleted", {
		operationId,
		trigger,
		status,
		failureSource,
		durationMs,
		...statistics,
	});
	const event = {
		eventName: "HistoryCompaction",
		trigger,
		status,
		failureSource,
		durationMs,
		...statistics,
	};
	if (failureSource === undefined) {
		logger?.sendTelemetryEvent(event);
	} else {
		// Policy errors can contain application data, so only report the failure category.
		// Engine errors come from Fluid itself, so they are attached to help diagnose them.
		logger?.sendErrorEvent(event, engineError);
	}
}

/**
 * Asks the application for a whole-history compaction plan, and converts it to validated, ordered trunk index ranges.
 * @remarks
 * This is not a method of {@link SharedTreeKernel} because its methods are wrapped so that any error breaks the tree,
 * and errors from the application's policy must be catchable without breaking it.
 * @throws A `UsageError` if the plan names a revision that is not in `history`, has a reversed or overlapping range,
 * extends beyond the eligible prefix, or provides metadata that is not a JSON object.
 */
function planCompactionRanges(
	history: readonly GraphCommit<SharedTreeChange>[],
	eligibleCount: number,
	idCompressor: IIdCompressor,
	planCompaction: PlanCompaction,
): HistoryCompactionRange[] {
	const plan = planCompaction(
		history.map(
			(commit) => new LazyTreeBranchCommitMetadata(commit, idCompressor, () => undefined),
		),
		eligibleCount,
	);
	const indexByRevision = new Map<RevisionTag, number>(
		history.map((commit, index) => [commit.revision, index]),
	);
	const indexOf = (revision: CommitRevision): number => {
		let tag: RevisionTag | undefined;
		try {
			tag = idCompressor.tryRecompress(revision as StableId);
		} catch {
			// Not a well-formed revision, so it cannot be in the history.
		}
		const index = tag === undefined ? undefined : indexByRevision.get(tag);
		if (index === undefined) {
			throw new UsageError(
				`Compaction plan names revision ${revision}, which is not in the history`,
			);
		}
		return index;
	};
	const ranges = plan.ranges.map((range): HistoryCompactionRange => {
		const oldestIndex = indexOf(range.oldest);
		const newestIndex = indexOf(range.newest);
		if (oldestIndex > newestIndex) {
			throw new UsageError(
				"A compaction range's oldest commit must not be newer than its newest",
			);
		}
		if (newestIndex >= eligibleCount) {
			throw new UsageError("Compaction ranges must stay within the eligible history prefix");
		}
		if (range.metadata !== undefined && !isJsonObject(range.metadata)) {
			throw new UsageError("A compaction range's metadata must be a JSON object");
		}
		return {
			oldestIndex,
			newestIndex,
			metadata:
				range.metadata === undefined ? undefined : { metadata: range.metadata, children: [] },
		};
	});
	ranges.sort((a, b) => a.oldestIndex - b.oldestIndex);
	for (let index = 1; index < ranges.length; index++) {
		if (
			(ranges[index]?.oldestIndex ?? fail("Expected a range")) <=
			(ranges[index - 1]?.newestIndex ?? fail("Expected a range"))
		) {
			throw new UsageError("Compaction ranges must not overlap");
		}
	}
	return ranges;
}
