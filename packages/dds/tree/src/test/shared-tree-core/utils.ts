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
import { RevisionTagCodec, TreeStoredSchemaRepository } from "../../core/index.js";
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

	public get preparedCommitsCount(): number {
		return this.commitEnricher.preparedCommitsCount;
	}
}
