/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

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
	type IFluidSerializer,
} from "@fluidframework/shared-object-base/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type {
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import type { IFluidLoadable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IChannelView } from "../../shared-tree/index.js";
import { Breakable } from "../../util/index.js";

const codecOptions: ICodecOptions = {
	jsonValidator: typeboxValidator,
};
const formatVersions = { editManager: 1, message: 1, fieldBatch: 1 };

export function createTree<TIndexes extends readonly Summarizable[]>(
	indexes: TIndexes,
	resubmitMachine?: ResubmitMachine<DefaultChangeset>,
	enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
): SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
	// TODO: consider using createTreeInner directly and avoiding the need for a SharedObject
	return new TestSharedTreeCore(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		undefined,
		indexes,
		undefined,
		undefined,
		resubmitMachine,
		enricher,
	).kernel;
}

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
	runtime: IFluidDataStoreRuntime,
	schema: TreeStoredSchemaRepository,
	resubmitMachine?: ResubmitMachine<DefaultChangeset>,
	enricher?: ChangeEnricherReadonlyCheckout<DefaultChangeset>,
): [SharedTreeCore<DefaultEditBuilder, DefaultChangeset>, DefaultChangeFamily] {
	assert(runtime.idCompressor !== undefined, "The runtime must provide an ID compressor");

	const codec = makeModularChangeCodecFamily(
		fieldKindConfigurations,
		new RevisionTagCodec(runtime.idCompressor),
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
			runtime,
			schema,
			defaultSchemaPolicy,
			resubmitMachine,
			enricher,
		),
		changeFamily,
	];
}

/**
 * SharedObject powered by `SharedTreeCore` with
 * - some protected methods exposed
 * - encoded data schema validation enabled
 */
export class TestSharedTreeCore extends SharedObject {
	public readonly kernel: SharedTreeCore<DefaultEditBuilder, DefaultChangeset>;

	private static readonly attributes: IChannelAttributes = {
		type: "TestSharedTreeCore",
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

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
		[this.kernel, this.changeFamily] = createTreeInner(
			this,
			this.serializer,
			(content, localOpMetadata) => this.submitLocalMessage(content, localOpMetadata),
			this.logger,
			summarizables,
			chunkCompressionStrategy,
			runtime,
			schema,
			resubmitMachine,
			enricher,
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

	public get editor(): DefaultEditBuilder {
		return this.transaction.activeBranchEditor;
	}

	public readonly transaction: SquashingTransactionStack<DefaultEditBuilder, DefaultChangeset>;
}
