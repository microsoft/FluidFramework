/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ConfigTypes,
	IConfigProviderBase,
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { MockRuntime, validateSummary } from "./blobManager.spec";

describe("Shutdown", () => {
	let runtime: MockRuntime;
	let mc: MonitoringContext;

	beforeEach(() => {
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		mc = mixinMonitoringContext(createChildLogger(), configProvider({}));
		runtime = new MockRuntime(mc);
	});

	it("shutdown while uploading blob", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		const shutdownP = runtime.blobManager.shutdownPendingBlobs();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		await shutdownP;
		const pendingState = runtime.getPendingState();
		const pendingBlobs = pendingState[1];
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].attached, true);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].uploadTime, undefined);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable.size, 1);
	});

	it("shutdown while waiting for op", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs();
		const shutdownP = runtime.blobManager.shutdownPendingBlobs();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		await shutdownP;
		const pendingState = runtime.getPendingState();
		const pendingBlobs = pendingState[1];
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].attached, true);
		assert.ok(Object.values<any>(pendingBlobs)[0].uploadTime);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable.size, 1);
	});

	it("shutdown multiple blobs", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs();
		const blob2 = IsoBuffer.from("blob2", "utf8");
		const handleP2 = runtime.createBlob(blob2);
		const shutdownP = runtime.blobManager.shutdownPendingBlobs();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		await assert.doesNotReject(handleP2);
		await shutdownP;
		const pendingState = runtime.getPendingState();
		const pendingBlobs = pendingState[1];
		assert.strictEqual(Object.keys(pendingBlobs).length, 2);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 2);
		assert.strictEqual(summaryData2.redirectTable.size, 2);
	});
});
