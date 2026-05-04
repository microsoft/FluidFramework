/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type {
	DataStoreKind,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";

import { dataStoreKind, sharedObjectRegistryFromIterable } from "./dataStoreKind.js";
import {
	type SharedKernel,
	type SharedKernelFactory,
	makeSharedObjectKind,
} from "./sharedObjectKernel.js";
import { createSingleBlobSummary } from "./utils.js";

class StatelessKernel implements SharedKernel {
	summarizeCore(): ISummaryTreeWithStats {
		return createSingleBlobSummary("header", "{}");
	}
	onDisconnect(): void {}
	reSubmitCore(): void {}
	applyStashedOp(): void {}
	processMessagesCore(): void {}
}

const statelessKernelFactory: SharedKernelFactory<object> = {
	create() {
		const kernel = new StatelessKernel();
		return { kernel, view: {} };
	},
	async loadCore() {
		const kernel = new StatelessKernel();
		return { kernel, view: {} };
	},
};

const statelessSharedObjectKind = makeSharedObjectKind<IFluidLoadable>({
	type: "com.microsoft.fluid.test.stateless",
	attributes: {
		type: "com.microsoft.fluid.test.stateless",
		snapshotFormatVersion: "0.1",
	},
	telemetryContextPrefix: "test_stateless_",
	factory: statelessKernelFactory,
});

/**
 * Creates a trivial stub {@link @fluidframework/runtime-definitions#DataStoreKind} backed by a
 * stateless shared object.
 * Useful in tests that need a valid data store but don't care about the content.
 * @internal
 */
export function makeStubDataStoreKind(type: string): DataStoreKind {
	return dataStoreKind({
		type,
		registry: sharedObjectRegistryFromIterable([statelessSharedObjectKind]),
		async instantiateFirstTime(rootCreator) {
			return rootCreator.create(statelessSharedObjectKind);
		},
		async view() {
			return {};
		},
	});
}
