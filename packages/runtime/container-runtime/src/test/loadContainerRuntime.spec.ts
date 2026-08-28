/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import Sinon from "sinon";

import {
	ContainerRuntime,
	type DeprecatedLoadContainerRuntimeParams,
	type LoadContainerRuntimeParams,
	loadContainerRuntime,
	loadContainerRuntimeAlpha,
} from "../containerRuntime.js";

const commonParams = {
	context: undefined as unknown as IContainerContext,
	registryEntries: [],
	existing: false,
	provideEntryPoint: async () => ({}),
};

describe("loadContainerRuntime compatibility parameter", () => {
	const runtime = {} as unknown as ContainerRuntime;
	let sandbox: Sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = Sinon.createSandbox();
	});

	afterEach(() => {
		sandbox.restore();
	});

	const loadContainerRuntimeWithSelectedParams = (
		params: LoadContainerRuntimeParams | DeprecatedLoadContainerRuntimeParams,
	): Promise<unknown> => loadContainerRuntime(params);

	it("forwards the canonical compatibility parameter to the internal loader", async () => {
		const loadRuntime = sandbox.stub(ContainerRuntime, "loadRuntime").resolves(runtime);

		const result = await loadContainerRuntimeWithSelectedParams({
			...commonParams,
			oldestSupportedClient: "2.0.0",
		});

		assert.equal(result, runtime);
		assert.equal(loadRuntime.callCount, 1);
		assert.equal(loadRuntime.firstCall.args[0].oldestSupportedClient, "2.0.0");
		assert.equal(loadRuntime.firstCall.args[0].minVersionForCollab, undefined);
	});

	it("forwards the deprecated compatibility parameter to the internal loader", async () => {
		const loadRuntime = sandbox.stub(ContainerRuntime, "loadRuntime").resolves(runtime);

		const result = await loadContainerRuntimeWithSelectedParams({
			...commonParams,
			minVersionForCollab: "2.0.0",
		});

		assert.equal(result, runtime);
		assert.equal(loadRuntime.callCount, 1);
		assert.equal(loadRuntime.firstCall.args[0].oldestSupportedClient, undefined);
		assert.equal(loadRuntime.firstCall.args[0].minVersionForCollab, "2.0.0");
	});

	it("forwards the canonical compatibility parameter through the alpha loader", async () => {
		const loadRuntime2 = sandbox.stub(ContainerRuntime, "loadRuntime2").resolves({ runtime });

		const result = await loadContainerRuntimeAlpha({
			...commonParams,
			oldestSupportedClient: "2.0.0",
		});

		assert.equal(result.runtime, runtime);
		assert.equal(loadRuntime2.callCount, 1);
		assert.equal(loadRuntime2.firstCall.args[0].oldestSupportedClient, "2.0.0");
		assert.equal(loadRuntime2.firstCall.args[0].minVersionForCollab, undefined);
	});

	it("rejects a missing compatibility parameter at runtime", async () => {
		await assert.rejects(
			// @ts-expect-error A compatibility property is required.
			loadContainerRuntime(commonParams),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});

	it("rejects both compatibility parameters at runtime", async () => {
		await assert.rejects(
			// @ts-expect-error Exactly one compatibility property may be supplied.
			loadContainerRuntime({
				...commonParams,
				oldestSupportedClient: "2.0.0",
				minVersionForCollab: "2.0.0",
			}),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});

	it("accepts the deprecated compatibility parameter at the public boundary", async () => {
		const context = {
			taggedLogger: { send: () => {} },
		} as unknown as IContainerContext;

		// Reaching version validation proves the public exact-one guard accepted the deprecated
		// property. The invalid version avoids requiring a complete container context in this test.
		await assert.rejects(
			loadContainerRuntime({
				...commonParams,
				context,
				minVersionForCollab: "1.2.3.4" as OldestSupportedClientVersion,
			}),
			/Invalid compatibility version: 1\.2\.3\.4/,
		);
	});

	it("requires the canonical compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			// @ts-expect-error The alpha API requires oldestSupportedClient.
			loadContainerRuntimeAlpha(commonParams),
			/oldestSupportedClient must be specified/,
		);
	});

	it("rejects the deprecated compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			loadContainerRuntimeAlpha({
				...commonParams,
				// @ts-expect-error The alpha API only accepts the canonical property.
				minVersionForCollab: "2.0.0",
			}),
			/minVersionForCollab is not supported by loadContainerRuntimeAlpha/,
		);
	});
});
