/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import type { IPendingBlobs } from "../blobManager/index.js";

import { MockRuntime, validateSummary } from "./blobManager.spec.js";

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
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = (pendingState[1] ?? {}) as IPendingBlobs;
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values(pendingBlobs)[0].uploadTime, undefined);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable?.length, 1);
	});

	it("get blobs and wait for blob attach while waiting for op", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs(true);
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = (pendingState[1] ?? {}) as IPendingBlobs;
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values(pendingBlobs)[0].acked, false);
		assert.ok(Object.values(pendingBlobs)[0].uploadTime);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable?.length, 1);
	});

	it("shutdown multiple blobs", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs(true);
		const blob2 = IsoBuffer.from("blob2", "utf8");
		const handleP2 = runtime.createBlob(blob2);
		const pendingStateP = runtime.getPendingLocalState();
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
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 2);
		assert.strictEqual(summaryData2.redirectTable?.length, 2);
	});

	it("upload blob while getting pending state", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs(true);
		const blob2 = IsoBuffer.from("blob2", "utf8");
		const handleP2 = runtime.createBlob(blob2);
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		const handleP3 = runtime.createBlob(IsoBuffer.from("blob3", "utf8"));
		await runtime.processBlobs(true);
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		await assert.doesNotReject(handleP2);
		await assert.doesNotReject(handleP3);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		assert.strictEqual(Object.keys(pendingBlobs).length, 3);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 3);
		assert.strictEqual(summaryData2.redirectTable?.length, 3);
	});

	it("retries blob after being rejected if it was stashed", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = (pendingState[1] ?? {}) as IPendingBlobs;
		assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		assert.strictEqual(Object.values(pendingBlobs)[0].acked, false);
		assert.strictEqual(Object.values(pendingBlobs)[0].uploadTime, undefined);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect(0, true);
		await runtime2.processAll();
		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable?.length, 1);
	});

	it("does not restart upload after applying stashed ops if not expired", async () => {
		await runtime.attach();
		await runtime.connect();
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs(true);
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		assert.ok(pendingBlobs[Object.keys(pendingBlobs)[0]].storageId);
		const summaryData = validateSummary(runtime);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		assert.strictEqual(runtime2.unprocessedBlobs.size, 0);
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable?.length, 1);
	});

	it("does restart upload after applying stashed ops if expired", async () => {
		await runtime.attach();
		await runtime.connect();
		runtime.attachedStorage.minTTL = 0.001;
		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		await runtime.processBlobs(true);
		const pendingStateP = runtime.getPendingLocalState();
		await runtime.processHandles();
		await assert.doesNotReject(handleP);
		const pendingState = await pendingStateP;
		const pendingBlobs = pendingState[1] ?? {};
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		assert.ok(pendingBlobs[Object.keys(pendingBlobs)[0]].storageId);
		const summaryData = validateSummary(runtime);

		const runtime2 = new MockRuntime(mc, summaryData, false, pendingState);
		await runtime2.attach();
		await runtime2.connect();
		await runtime2.processAll();

		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable?.length, 1);
	});
});
