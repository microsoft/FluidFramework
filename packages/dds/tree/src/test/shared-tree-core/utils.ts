/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedTreeBranch, SharedTreeCore, Summarizable } from "../../shared-tree-core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
} from "../../feature-libraries/index.js";
import { testRevisionTagCodec } from "../utils.js";
import { ICodecOptions } from "../../codec/index.js";
import { TreeStoredSchemaRepository, TreeStoredSchemaSubscription } from "../../core/index.js";

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
		schema: TreeStoredSchemaSubscription = new TreeStoredSchemaRepository(),
		chunkCompressionStrategy: TreeCompressionStrategy = TreeCompressionStrategy.Uncompressed,
	) {
		const codecOptions: ICodecOptions = { jsonValidator: typeboxValidator };
		super(
			summarizables,
			new DefaultChangeFamily(
				testRevisionTagCodec,
				makeFieldBatchCodec(codecOptions),
				codecOptions,
				chunkCompressionStrategy,
			),
			codecOptions,
			id,
			runtime,
			TestSharedTreeCore.attributes,
			id,
			{ policy: defaultSchemaPolicy, schema },
		);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}
}
