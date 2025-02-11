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
		const changeFamily = new DefaultChangeFamily(codec);
		super(
			summarizables,
			changeFamily,
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
		this.changeFamily = changeFamily;

		this.transaction = new SquashingTransactionStack(
			this.getLocalBranch(),
			(commits: GraphCommit<DefaultChangeset>[]) => {
				const revision = this.mintRevisionTag();
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
				this.commitEnricher.startTransaction();
			}
		});
		this.transaction.events.on("aborting", () => {
			if (this.isAttached()) {
				this.commitEnricher.abortTransaction();
			}
		});
		this.transaction.events.on("committing", () => {
			if (this.isAttached()) {
				this.commitEnricher.commitTransaction();
			}
		});
		this.transaction.activeBranchEvents.on("afterChange", (event) => {
			if (event.type === "append" && this.isAttached() && this.transaction.isInProgress()) {
				this.commitEnricher.addTransactionCommits(event.newCommits);
			}
		});
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}

	public override get editor(): DefaultEditBuilder {
		return this.transaction.activeBranchEditor;
	}

	public readonly transaction: SquashingTransactionStack<DefaultEditBuilder, DefaultChangeset>;
}
