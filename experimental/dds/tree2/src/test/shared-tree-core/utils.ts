/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedTreeBranch, SharedTreeCore, Summarizable } from "../../shared-tree-core";
import { AnchorSet } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { DefaultChangeFamily, DefaultChangeset, DefaultEditBuilder } from "../../feature-libraries";
import { MockRepairDataStoreProvider } from "../utils";

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
		anchors = new AnchorSet(),
	) {
		super(
			summarizables,
			new DefaultChangeFamily({ jsonValidator: typeboxValidator }),
			anchors,
			new MockRepairDataStoreProvider(),
			{ jsonValidator: typeboxValidator },
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
