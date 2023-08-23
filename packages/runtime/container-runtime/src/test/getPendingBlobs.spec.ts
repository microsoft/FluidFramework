/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { MockRuntime, validateSummary } from "./blobManager.spec";

describe("getPendingLocalState", () => {
	let runtime: MockRuntime;
	let mc: MonitoringContext;

	beforeEach(() => {
		mc = mixinMonitoringContext(createChildLogger(), undefined);
		runtime = new MockRuntime(mc);
	});

	it("get blobs while uploading", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		const pendingStateP = runtime.getPendingLocalState(true);
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].attached, true);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].uploadTime, undefined);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.processStashed();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable.size, 1);
	});

	it("get blobs and wait for blob attach while waiting for op", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs();
		const pendingStateP = runtime.getPendingLocalState(true);
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].attached, true);
		assert.ok(Object.values<any>(pendingBlobs)[0].uploadTime);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.processStashed();
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
		const pendingStateP = runtime.getPendingLocalState(true);
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		await assert.doesNotReject(handleP2);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		assert.strictEqual(Object.keys(pendingBlobs).length, 2);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.processStashed();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 2);
		assert.strictEqual(summaryData2.redirectTable.size, 2);
	});
});
