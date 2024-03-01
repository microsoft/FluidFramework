/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	CreateChildSummarizerNodeFn,
	IContainerRuntimeBase,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { RemoteChannelContext } from "../remoteChannelContext.js";

describe("RemoteChannelContext Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	const loadRuntime = (context: IFluidDataStoreContext, registry: ISharedObjectRegistry) =>
		new FluidDataStoreRuntime(context, registry, /* existing */ false, async () => ({
			myProp: "myValue",
		}));

	beforeEach(() => {
		dataStoreContext = new MockFluidDataStoreContext();
		// back-compat 0.38 - DataStoreRuntime looks in container runtime for certain properties that are unavailable
		// in the data store context.
		dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
		sharedObjectRegistry = {
			get(name: string) {
				throw new Error("Not implemented");
			},
		};
	});

	it("rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = () =>
			new RemoteChannelContext(
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				(c, lom) => {},
				(s: string) => {},
				(s, o) => {},
				invalidId,
				undefined as unknown as ISnapshotTree,
				sharedObjectRegistry,
				undefined,
				undefined as unknown as CreateChildSummarizerNodeFn,
				"SomeAttachMessageType",
			);
		assert.throws(
			codeBlock,
			(e: Error) => validateAssertionError(e, "Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});
});
