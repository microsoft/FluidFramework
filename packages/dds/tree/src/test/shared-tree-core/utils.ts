/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type {
	IFluidHandle,
	IFluidLoadable,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	createIdCompressor,
	type IIdCompressor,
} from "@fluidframework/id-compressor/internal";
import type {
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	IRuntimeMessageCollection,
} from "@fluidframework/runtime-definitions/internal";
import {
	SharedObject,
	type IChannelView,
	type IFluidSerializer,
	type ISharedObject,
	type ISharedObjectHandle,
} from "@fluidframework/shared-object-base/internal";
import {
	MockFluidDataStoreRuntime,
	MockHandle,
} from "@fluidframework/test-runtime-utils/internal";

import {
	currentVersion,
	DependentFormatVersion,
	type CodecWriteOptions,
} from "../../codec/index.js";
import {
	RevisionTagCodec,
	TreeStoredSchemaRepository,
	type GraphCommit,
	type TaggedChange,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeset,
	type DefaultEditBuilder,
	type ModularChangeFormatVersion,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	fieldBatchCodecBuilder,
	makeModularChangeCodecFamily,
} from "../../feature-libraries/index.js";
import {
	changeFormatVersionForEditManager,
	changeFormatVersionForMessage,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { dependenciesForChangeFormat } from "../../shared-tree/sharedTreeChangeCodecs.js";
import {
	SquashingTransactionStack,
	type SharedTreeBranch,
	SharedTreeCore,
	type Summarizable,
	type EditManagerFormatVersion,
	supportedEditManagerFormatVersions,
	type MessageFormatVersion,
	supportedMessageFormatVersions,
	type EnrichmentConfig,
	type ChangeEnricher,
} from "../../shared-tree-core/index.js";
import { Breakable } from "../../util/index.js";
import { mockSerializer } from "../mockSerializer.js";
import { testIdCompressor } from "../utils.js";

export const testCodecOptions: CodecWriteOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: currentVersion,
};

class MockSharedObjectHandle extends MockHandle<ISharedObject> implements ISharedObjectHandle {
	public bind(): never {
		throw new Error("MockSharedObjectHandle.bind() unimplemented.");
	}
}

export function createTree<TIndexes extends readonly Summarizable[]>(options: {
	indexes: TIndexes;
	enrichmentConfig?: EnrichmentConfig<DefaultChangeset>;
	codecOptions?: CodecWriteOptions;
}): SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
	const { indexes, enrichmentConfig, codecOptions } = options;
	// This could use TestSharedTreeCore then return its kernel instead of using these mocks, but that would depend on far more code than needed (including other mocks).

	// Summarizer requires ISharedObjectHandle. Specifically it looks for `bind` method.
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- empty object is sufficient for this mock
	const handle = new MockSharedObjectHandle({} as ISharedObject);
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
		codecOptions ?? testCodecOptions,
		enrichmentConfig,
	)[0];
}

/**
 * Create a SharedObject wrapping a SharedTreeCore.
 * @remarks
 * TODO: See note on {@link TestSharedTreeCore}.
 */
export function createTreeSharedObject<TIndexes extends readonly Summarizable[]>(
	indexes: TIndexes,
	enrichmentConfig?: EnrichmentConfig<DefaultChangeset>,
): TestSharedTreeCore {
	return new TestSharedTreeCore(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		undefined,
		indexes,
		undefined,
		undefined,
		enrichmentConfig,
	);
}

export function makeTestDefaultChangeFamily(options?: {
	idCompressor?: IIdCompressor;
	chunkCompressionStrategy?: TreeCompressionStrategy;
	codecOptions?: CodecWriteOptions;
}): DefaultChangeFamily {
	const codecOptions = options?.codecOptions ?? testCodecOptions;
	return new DefaultChangeFamily(
		makeModularChangeCodecFamily(
			fieldKindConfigurations,
			new RevisionTagCodec(options?.idCompressor ?? testIdCompressor),
			fieldBatchCodecBuilder.build(codecOptions),
			codecOptions,
			options?.chunkCompressionStrategy ?? TreeCompressionStrategy.Compressed,
		),
		codecOptions,
	);
}

/**
 * Use the same codecs as SharedTree but without the SharedTreeFamily wrapper.
 * This an arbitrary choice that could be revisited.
 */
const modularChangeFormatVersionForEditManager: DependentFormatVersion<
	EditManagerFormatVersion,
	ModularChangeFormatVersion
> = DependentFormatVersion.fromPairs(
	Array.from(supportedEditManagerFormatVersions, (e) => [
		e,
		dependenciesForChangeFormat.get(changeFormatVersionForEditManager.lookup(e))
			?.modularChange ?? fail("Unknown change format"),
	]),
);

/**
 * Use the same codecs as SharedTree but without the SharedTreeFamily wrapper.
 * This an arbitrary choice that could be revisited.
 */
const modularChangeFormatVersionForMessage: DependentFormatVersion<
	MessageFormatVersion,
	ModularChangeFormatVersion
> = DependentFormatVersion.fromPairs(
	Array.from(supportedMessageFormatVersions, (m) => [
		m,
		dependenciesForChangeFormat.get(changeFormatVersionForMessage.lookup(m))?.modularChange ??
			fail("Unknown change format"),
	]),
);

function createTreeInner(
	sharedObject: IChannelView & IFluidLoadable,
	serializer: IFluidSerializer,
	submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void,
	logger: ITelemetryBaseLogger | undefined,
	summarizables: readonly Summarizable[],
	chunkCompressionStrategy: TreeCompressionStrategy,
	idCompressor: IIdCompressor,
	schema: TreeStoredSchemaRepository,
	codecOptions: CodecWriteOptions = testCodecOptions,
	enrichmentConfig?: EnrichmentConfig<DefaultChangeset>,
	editor?: () => DefaultEditBuilder,
): [SharedTreeCore<DefaultEditBuilder, DefaultChangeset>, DefaultChangeFamily] {
	const changeFamily = makeTestDefaultChangeFamily({ idCompressor, chunkCompressionStrategy });
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
			modularChangeFormatVersionForEditManager,
			modularChangeFormatVersionForMessage,
			idCompressor,
			schema,
			defaultSchemaPolicy,
			enrichmentConfig ?? { enricher: new NoOpChangeEnricher<DefaultChangeset>() },
			editor,
		),
		changeFamily,
	];
}

class NoOpChangeEnricher<TChange> implements ChangeEnricher<TChange> {
	public enrich(
		context: GraphCommit<TChange>,
		changes: readonly TaggedChange<TChange>[],
	): TChange[] {
		return changes.map((change) => change.change);
	}
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
		enrichmentConfig?: EnrichmentConfig<DefaultChangeset>,
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
			testCodecOptions,
			enrichmentConfig,
			() => this.transaction.activeBranchEditor,
		);

		this.transaction = new SquashingTransactionStack(
			this.getLocalBranch(),
			this.kernel.mintRevisionTag,
		);
	}

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		return this.kernel.summarizeCore(serializer, telemetryContext, incrementalSummaryContext);
	}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		this.kernel.processMessagesCore(messagesCollection);
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
