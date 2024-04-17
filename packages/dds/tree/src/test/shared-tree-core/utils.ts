/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { ICodecOptions } from "../../codec/index.js";
import { TreeStoredSchemaRepository } from "../../core/index.js";
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
import { SharedTreeBranch, SharedTreeCore, Summarizable } from "../../shared-tree-core/index.js";
import { testRevisionTagCodec } from "../utils.js";

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
		runtime: IFluidDataStoreRuntime = new MockFluidDataStoreRuntime(),
		id = "TestSharedTreeCore",
		summarizables: readonly Summarizable[] = [],
		schema: TreeStoredSchemaRepository = new TreeStoredSchemaRepository(),
		chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Uncompressed,
	) {
		const codecOptions: ICodecOptions = {
			jsonValidator: typeboxValidator,
		};
		const formatVersions = { editManager: 1, message: 1, fieldBatch: 1 };
		const codec = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
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
		);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}
}
