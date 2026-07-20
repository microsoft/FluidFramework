/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { mixinAttributor } from "../mixinAttributor.js";

describe("mixinAttributor", () => {
	it("forwards minDocumentRuntimeVersion to the base runtime", async () => {
		let forwardedParams: Parameters<typeof ContainerRuntime.loadRuntime>[0] | undefined;

		class TestContainerRuntime extends ContainerRuntime {
			public static override async loadRuntime(
				params: Parameters<typeof ContainerRuntime.loadRuntime>[0],
			): Promise<ContainerRuntime> {
				forwardedParams = params;
				return ContainerRuntime.prototype;
			}
		}

		const ContainerRuntimeWithAttributor = mixinAttributor(TestContainerRuntime);
		await ContainerRuntimeWithAttributor.loadRuntime({
			context: {
				taggedLogger: new MockLogger(),
			} as unknown as IContainerContext,
			registryEntries: [],
			existing: true,
			provideEntryPoint: async () => ({}),
			minDocumentRuntimeVersion: "2.0.0",
		});

		assert.equal(forwardedParams?.minDocumentRuntimeVersion, "2.0.0");
	});
});
