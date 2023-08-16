/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SummaryType } from "@fluidframework/protocol-definitions";
import {
	IContainerRuntimeBase,
	IGarbageCollectionData,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IErrorBase, FluidObject } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime";

describe("FluidDataStoreRuntime Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	function createRuntime(
		context: IFluidDataStoreContext,
		registry: ISharedObjectRegistry,
		entrypointInitializationFn?: (rt: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		return new FluidDataStoreRuntime(
			context,
			registry,
			/* existing */ false,
			entrypointInitializationFn ??
				(async (dataStoreRuntime) => requestFluidObject(dataStoreRuntime, "/")),
		);
	}

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

	it("FluidDataStoreRuntime.load rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		dataStoreContext = new MockFluidDataStoreContext(invalidId);
		const codeBlock = () =>
			FluidDataStoreRuntime.load(
				dataStoreContext,
				sharedObjectRegistry,
				/* existing */ false,
			);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(
				e,
				"Id cannot contain slashes. DataStoreContext should have validated this.",
			),
		);
	});

	it("constructor rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		dataStoreContext = new MockFluidDataStoreContext(invalidId);
		const codeBlock = () =>
			new FluidDataStoreRuntime(
				dataStoreContext,
				sharedObjectRegistry,
				false,
				async (dataStoreRuntime) => {
					throw new Error("This shouldn't be called during the test");
				},
			);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(
				e,
				"Id cannot contain slashes. DataStoreContext should have validated this.",
			),
		);
	});

	it("can create a data store runtime", () => {
		let failed: boolean = false;
		let dataStoreRuntime: FluidDataStoreRuntime | undefined;
		try {
			dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		} catch (error) {
			failed = true;
		}
		assert.strictEqual(failed, false, "Data store runtime creation failed");
		assert.strictEqual(
			dataStoreRuntime?.id,
			dataStoreContext.id,
			"Data store runtime's id in incorrect",
		);
	});

	it("can summarize an empty data store runtime", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const summarizeResult = await dataStoreRuntime.summarize(true, false);
		assert(
			summarizeResult.summary.type === SummaryType.Tree,
			"Data store runtime did not return a summary tree",
		);
		assert(
			Object.keys(summarizeResult.summary.tree).length === 0,
			"The summary should be empty",
		);
	});

	it("can get GC data of an empty data store runtime", async () => {
		// The GC data should have a single node for the data store runtime with empty outbound routes.
		const expectedGCData: IGarbageCollectionData = {
			gcNodes: { "/": [] },
		};
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const gcData = await dataStoreRuntime.getGCData();
		assert.deepStrictEqual(gcData, expectedGCData, "The GC data is incorrect");
	});

	it("createChannel rejects ids with slashes", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = () => dataStoreRuntime.createChannel(invalidId, "SomeType");
		assert.throws(
			codeBlock,
			(e: IErrorBase) =>
				e.errorType === ContainerErrorType.usageError &&
				e.message === `Id cannot contain slashes: ${invalidId}`,
		);
	});

	it("entryPoint is initialized correctly", async () => {
		const myObj: FluidObject = { fakeProp: "fakeValue" };
		const dataStoreRuntime = createRuntime(
			dataStoreContext,
			sharedObjectRegistry,
			async (dsRuntime) => myObj,
		);
		assert(
			(await dataStoreRuntime.entryPoint?.get()) === myObj,
			"entryPoint was not initialized",
		);
	});
});
