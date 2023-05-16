/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedTreeBranch, SharedTreeCore, Summarizable } from "../../shared-tree-core";
import { AnchorSet, ITreeCursorSynchronous, RepairDataStore } from "../../core";
import { defaultChangeFamily, DefaultChangeset, DefaultEditBuilder } from "../../feature-libraries";
import { TransactionResult } from "../../util";
import { MockRepairDataStoreProvider } from "../utils";

/** A `SharedTreeCore` with protected methods exposed but no additional behavior */
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
			defaultChangeFamily,
			anchors,
			new MockRepairDataStoreProvider(),
			id,
			runtime,
			TestSharedTreeCore.attributes,
			id,
		);
	}

	public override startTransaction(
		repairStore?: RepairDataStore<ITreeCursorSynchronous> | undefined,
	): void {
		return super.startTransaction(repairStore);
	}

	public override commitTransaction(): TransactionResult.Commit {
		return super.commitTransaction();
	}

	public override abortTransaction(): TransactionResult.Abort {
		return super.abortTransaction();
	}

	public override isTransacting(): boolean {
		return super.isTransacting();
	}

	public override forkBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.forkBranch(new MockRepairDataStoreProvider());
	}

	public override mergeBranch(
		branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
	): void {
		return super.mergeBranch(branch);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
	}
}
