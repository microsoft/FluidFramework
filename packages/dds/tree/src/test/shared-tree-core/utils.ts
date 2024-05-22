/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { ICodecOptions } from "../../codec/index.js";
import { GraphCommit, RevisionTagCodec, TreeStoredSchemaRepository } from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	makeFieldBatchCodec,
	makeModularChangeCodecFamily,
} from "../../feature-libraries/index.js";
import {
	ICommitEnricher,
	SharedTreeBranch,
	SharedTreeCore,
	Summarizable,
} from "../../shared-tree-core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { ClonableSchemaAndPolicy } from "../../shared-tree-core/sharedTreeCore.js";
import { testIdCompressor } from "../utils.js";
import { strict as assert } from "assert";

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

	public constructor(
		runtime: IFluidDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: testIdCompressor,
		}),
		id = "TestSharedTreeCore",
		summarizables: readonly Summarizable[] = [],
		schema: TreeStoredSchemaRepository = new TreeStoredSchemaRepository(),
		chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Uncompressed,
		enricher?: ICommitEnricher<DefaultChangeset>,
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
			enricher,
		);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}

	public readonly submitted: GraphCommit<DefaultChangeset>[] = [];

	protected override submitCommit(
		commit: GraphCommit<DefaultChangeset>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
		isResubmit = false,
	): GraphCommit<DefaultChangeset> | undefined {
		const submitted = super.submitCommit(commit, schemaAndPolicy, isResubmit);
		if (submitted !== undefined) {
			this.submitted.push(submitted);
		}
		return submitted;
	}
}
