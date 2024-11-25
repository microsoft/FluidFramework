/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { ICodecOptions } from "../../codec/index.js";
import {
	RevisionTagCodec,
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
	type ResubmitMachine,
	type SharedTreeBranch,
	SharedTreeCore,
	type Summarizable,
} from "../../shared-tree-core/index.js";
import { testIdCompressor } from "../utils.js";
import { strict as assert } from "node:assert";

/**
 * A `SharedTreeCore` with
 * - some protected methods exposed
 * - encoded data schema validation enabled
 */
export class TestSharedTreeCore extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset> {
	private static readonly attributes: IChannelAttributes = {
		type: "TestSharedTreeCore",
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	private transactionStart?: GraphCommit<DefaultChangeset>;

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
		assert(runtime.idCompressor !== undefined, "The runtime must provide an ID compressor");
		const codecOptions: ICodecOptions = {
			jsonValidator: typeboxValidator,
		};
		const formatVersions = { editManager: 1, message: 1, fieldBatch: 1 };
		const codec = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			new RevisionTagCodec(runtime.idCompressor),
			makeFieldBatchCodec(codecOptions, formatVersions.fieldBatch),
			codecOptions,
			chunkCompressionStrategy,
		);
		super(
			summarizables,
			new DefaultChangeFamily(codec),
			codecOptions,
			formatVersions,
			id,
			runtime,
			TestSharedTreeCore.attributes,
			id,
			schema,
			defaultSchemaPolicy,
			resubmitMachine,
			enricher,
		);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}

	protected override submitCommit(
		...args: Parameters<SharedTreeCore<DefaultEditBuilder, DefaultChangeset>["submitCommit"]>
	): void {
		// We do not submit ops for changes that are part of a transaction.
		if (this.transactionStart === undefined) {
			super.submitCommit(...args);
		}
	}

	public startTransaction(): void {
		assert(
			this.transactionStart === undefined,
			"Transaction already started. TestSharedTreeCore does not support nested transactions.",
		);
		this.transactionStart = this.getLocalBranch().getHead();
		this.commitEnricher.startTransaction();
	}

	public abortTransaction(): void {
		assert(this.transactionStart !== undefined, "No transaction to abort.");
		const start = this.transactionStart;
		this.transactionStart = undefined;
		this.commitEnricher.abortTransaction();
		this.getLocalBranch().removeAfter(start);
	}

	public commitTransaction(): void {
		assert(this.transactionStart !== undefined, "No transaction to commit.");
		const start = this.transactionStart;
		this.transactionStart = undefined;
		this.commitEnricher.commitTransaction();
		this.getLocalBranch().squashAfter(start);
	}
}
