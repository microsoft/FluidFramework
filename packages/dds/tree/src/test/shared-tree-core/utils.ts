/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockHandle,
} from "@fluidframework/test-runtime-utils/internal";

import type { ICodecOptions } from "../../codec/index.js";
import {
	RevisionTagCodec,
	tagChange,
	TreeStoredSchemaRepository,
	type GraphCommit,
} from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	type DefaultEditBuilder,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	makeFieldBatchCodec,
	makeModularChangeCodecFamily,
} from "../../feature-libraries/index.js";
import {
	type ChangeEnricherReadonlyCheckout,
	SquashingTransactionStack,
	type ResubmitMachine,
	type SharedTreeBranch,
	SharedTreeCore,
	type Summarizable,
} from "../../shared-tree-core/index.js";
import { testIdCompressor } from "../utils.js";
import { strict as assert } from "node:assert";
import {
	SharedObject,
	type IChannelView,
	type IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import {
	createIdCompressor,
	type IIdCompressor,
} from "@fluidframework/id-compressor/internal";
import type {
	IFluidHandle,
	IFluidLoadable,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { Breakable } from "../../util/index.js";
import { mockSerializer } from "../mockSerializer.js";

const codecOptions: ICodecOptions = {
	jsonValidator: typeboxValidator,
};
const formatVersions = { editManager: 1, message: 1, fieldBatch: 1 };

export function createTree<TIndexes extends readonly Summarizable[]>(
	indexes: TIndexes,
	resubmitMachine?: ResubmitMachine<DefaultChangeset>,
	enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
): SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
	// This could use TestSharedTreeCore then return its kernel instead of using these mocks, but that would depend on far more code than needed (including other mocks).

	const handle = new MockHandle({});
	const dummyChannel: IChannelView & IFluidLoadable = {
		attributes: { snapshotFormatVersion: "", type: "", packageVersion: "" },
		get handle(): IFluidHandle {
			return handle;
		},
		get IFluidLoadable(): IChannelView & IFluidLoadable {
			return this;
		},
		id: "createTree",
		isAttached: () => false,
	};
	const logger: ITelemetryBaseLogger = { send() {} };
	return createTreeInner(
		dummyChannel,
		mockSerializer,
		() => {},
		logger,
		indexes,
		TreeCompressionStrategy.Uncompressed,
		createIdCompressor(),
		new TreeStoredSchemaRepository(),
		resubmitMachine,
		enricher,
	)[0];
}

/**
 * Create a SharedObject wrapping a SharedTreeCore.
 * @remarks
 * TODO: See note on {@link TestSharedTreeCore}.
 */
export function createTreeSharedObject<TIndexes extends readonly Summarizable[]>(
	indexes: TIndexes,
	resubmitMachine?: ResubmitMachine<DefaultChangeset>,
	enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
): TestSharedTreeCore {
	return new TestSharedTreeCore(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		undefined,
		indexes,
		undefined,
		undefined,
		resubmitMachine,
		enricher,
	);
}

function createTreeInner(
	sharedObject: IChannelView & IFluidLoadable,
	serializer: IFluidSerializer,
	submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void,
	logger: ITelemetryBaseLogger | undefined,
	summarizables: readonly Summarizable[],
	chunkCompressionStrategy: TreeCompressionStrategy,
	idCompressor: IIdCompressor,
	schema: TreeStoredSchemaRepository,
	resubmitMachine?: ResubmitMachine<DefaultChangeset>,
	enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
	editor?: () => DefaultEditBuilder,
): [SharedTreeCore<DefaultEditBuilder, DefaultChangeset>, DefaultChangeFamily] {
	const codec = makeModularChangeCodecFamily(
		fieldKindConfigurations,
		new RevisionTagCodec(idCompressor),
		makeFieldBatchCodec(codecOptions, formatVersions.fieldBatch),
		codecOptions,
		chunkCompressionStrategy,
	);
	const changeFamily = new DefaultChangeFamily(codec);

	return [
		new SharedTreeCore(
			new Breakable("createTreeInner"),
			sharedObject,
			serializer,
			submitLocalMessage,
			logger,
			summarizables,
			changeFamily,
			codecOptions,
			formatVersions,
			idCompressor,
			schema,
			defaultSchemaPolicy,
			resubmitMachine,
			enricher,
			editor,
		),
		changeFamily,
	];
}

/**
 * SharedObject powered by `SharedTreeCore` with
 * - some protected methods exposed
 * - encoded data schema validation enabled
 *
 * @remarks
 * This reimplements various functionality from `SharedTree`.
 * TODO:
 * Usage of this type should be adjusted by doing one of:
 * 1. Use SharedTreeCore directly. (where possible).
 * 2. Port functionality being tested to SharedTreeCore, then use SharedTreeCore directly.
 * 3. Move the test (or split relevant portion of the test) to SharedTreeKernel tests, or SharedTree's tests, and use them and not TestSharedTreeCore.
 * 4. Find a place to put integration tests, and move the test there, and have it use SharedTree instead of TestSharedTreeCore.
 * 5. Use a generic wrapper for making SharedObjects from Kernels so there is no shared tree logic in the wrapper duplicating logic from SharedTree.
 *
 * Once the above is done for all users, this class should be removed.
 */
export class TestSharedTreeCore extends SharedObject {
	public readonly kernel: SharedTreeCore<DefaultEditBuilder, DefaultChangeset>;

	private static readonly attributes: IChannelAttributes = {
		type: "TestSharedTreeCore",
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public readonly transaction: SquashingTransactionStack<DefaultEditBuilder, DefaultChangeset>;
	private readonly changeFamily: DefaultChangeFamily;

	public constructor(
		runtime: IFluidDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: testIdCompressor,
		}),
		id = "TestSharedTreeCore",
		summarizables: readonly Summarizable[] = [],
		schema: TreeStoredSchemaRepository = new TreeStoredSchemaRepository(),
		chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Uncompressed,
		resubmitMachine?: ResubmitMachine<DefaultChangeset>,
		enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
	) {
		super(id, runtime, TestSharedTreeCore.attributes, id);
		assert(runtime.idCompressor !== undefined, "The runtime must provide an ID compressor");
		[this.kernel, this.changeFamily] = createTreeInner(
			this,
			this.serializer,
			(content, localOpMetadata) => this.submitLocalMessage(content, localOpMetadata),
			this.logger,
			summarizables,
			chunkCompressionStrategy,
			runtime.idCompressor,
			schema,
			resubmitMachine,
			enricher,
			() => this.transaction.activeBranchEditor,
		);

		this.transaction = new SquashingTransactionStack(
			this.getLocalBranch(),
			(commits: GraphCommit<DefaultChangeset>[]) => {
				const revision = this.kernel.mintRevisionTag();
				return tagChange(
					this.changeFamily.rebaser.changeRevision(
						this.changeFamily.rebaser.compose(commits),
						revision,
					),
					revision,
				);
			},
		);

		this.transaction.events.on("started", () => {
			if (this.isAttached()) {
				this.kernel.commitEnricher.startTransaction();
			}
		});
		this.transaction.events.on("aborting", () => {
			if (this.isAttached()) {
				this.kernel.commitEnricher.abortTransaction();
			}
		});
		this.transaction.events.on("committing", () => {
			if (this.isAttached()) {
				this.kernel.commitEnricher.commitTransaction();
			}
		});
		this.transaction.activeBranchEvents.on("afterChange", (event) => {
			if (event.type === "append" && this.isAttached() && this.transaction.isInProgress()) {
				this.kernel.commitEnricher.addTransactionCommits(event.newCommits);
			}
		});
	}

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		return this.kernel.summarizeCore(serializer, telemetryContext, incrementalSummaryContext);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.kernel.processCore(message, local, localOpMetadata);
	}

	protected onDisconnect(): void {}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await this.kernel.loadCore(services);
	}

	protected override didAttach(): void {
		this.kernel.didAttach();
	}

	protected override applyStashedOp(
		...args: Parameters<SharedTreeCore<DefaultEditBuilder, DefaultChangeset>["applyStashedOp"]>
	): void {
		this.kernel.applyStashedOp(...args);
	}

	public getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return this.kernel.getLocalBranch();
	}

	protected override reSubmitCore(
		...args: Parameters<SharedTreeCore<DefaultEditBuilder, DefaultChangeset>["reSubmitCore"]>
	): void {
		this.kernel.reSubmitCore(...args);
	}

	public get editor(): DefaultEditBuilder {
		return this.kernel.getEditor();
	}
}
