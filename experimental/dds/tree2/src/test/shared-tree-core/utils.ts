/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedTreeBranch, SharedTreeCore, Summarizable } from "../../shared-tree-core";
import { typeboxValidator } from "../../external-utilities";
import {
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	TreeCompressionStrategy,
	makeFieldBatchCodec,
} from "../../feature-libraries";
import { testIdCompressor } from "../utils";
import { ICodecOptions } from "../../codec";

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
	) {
		const codecOptions: ICodecOptions = { jsonValidator: typeboxValidator };
		super(
			summarizables,
			new DefaultChangeFamily(
				testIdCompressor,
				makeFieldBatchCodec(codecOptions, {
					encodeType: TreeCompressionStrategy.Uncompressed,
				}),
				codecOptions,
			),
			codecOptions,
			id,
			runtime,
			TestSharedTreeCore.attributes,
			id,
		);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}
}
