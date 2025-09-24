/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDetachedContainer,
	type IContainerExperimental,
	loadFrozenContainerFromPendingState,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { timeoutPromise, type TestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

describe("loadFrozenContainerFromPendingState", () => {
	it("loadFrozenContainerFromPendingState", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { urlResolver, codeDetails, codeLoader, loaderProps } = createLoader({
			deltaConnectionServer,
		});
		const container: IContainerExperimental = await createDetachedContainer({
			codeDetails,
			...loaderProps,
			configProvider: {
				getRawConfig: (name) => {
					switch (name) {
						case "Fluid.Container.enableOfflineLoad":
							return true;
						default:
							return undefined;
					}
				},
			},
		});
		const { ITestFluidObject }: FluidObject<TestFluidObject> =
			(await container.getEntryPoint()) ?? {};
		assert(ITestFluidObject !== undefined, "entrypoint must be test object");

		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`detached-${i}`, i);
		}

		await container.attach(urlResolver.createCreateNewRequest("test"));
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`attached-${i}`, i);
		}
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "url must exist");

		container.disconnect();
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`disconnected-${i}`, i);
		}

		const pendingLocalState = await container.getPendingLocalState?.();
		assert(pendingLocalState !== undefined, "must have pending state");

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			urlResolver,
			request: {
				url,
			},
			pendingLocalState,
		});

		assert(frozenContainer.readOnlyInfo.readonly === true, "must be readonly");
		assert(frozenContainer.readOnlyInfo.storageOnly === true, "must be readonly");

		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(frozenEntryPoint.ITestFluidObject !== undefined, "entrypoint must be test object");

		const frozenEntries = [...frozenEntryPoint.ITestFluidObject.root.entries()];
		assert(frozenEntries.length === [...ITestFluidObject.root.entries()].length, "Must match");

		container.connect();
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`afterGetPendingLocalState-${i}`, i);
		}

		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}
		assert(
			frozenEntries.length !== [...ITestFluidObject.root.entries()].length,
			"Must not match after new changes",
		);
		assert(
			frozenEntries.length === [...frozenEntryPoint.ITestFluidObject.root.entries()].length,
			"Must match as frozen container shouldn't get any new changes",
		);
	});
});
