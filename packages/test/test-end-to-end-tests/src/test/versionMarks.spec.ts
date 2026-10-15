/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import {
	getContainerEntryPointBackCompat,
	type ITestFluidObject,
	type ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describeCompat("Version marks", "NoCompat", function (getTestObjectProvider) {
	let provider: ITestObjectProvider;

	before(function () {
		provider = getTestObjectProvider();
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	const createTestContext = async () => {
		const container = await provider.makeTestContainer({
			runtimeOptions: { enableGroupedBatching: true },
		});
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;

		dataObject.root.set("bootstrap", true);
		await waitForContainerConnection(container);
		await provider.ensureSynchronized();

		return { containerRuntime, sharedMap: dataObject.root };
	};

	it("resolves a pending mark after its batch is sequenced", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();
		const sequenceNumberBeforeEdit = containerRuntime.deltaManager.lastSequenceNumber;
		const sequencedBatches = new Map<string, number>();
		const unsubscribe = containerRuntime.versionMarkResolver.onBatchSequenced(
			(batchId, sequenceNumber) => {
				sequencedBatches.set(batchId, sequenceNumber);
			},
		);

		sharedMap.set("normalEdit", true);
		const mark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(mark.kind === "pending", "the unacknowledged edit should produce a pending mark");

		await provider.ensureSynchronized();
		unsubscribe();

		const resolved = await containerRuntime.versionMarkResolver.resolve(
			mark.batchId,
			mark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"the mark should resolve after the edit is sequenced",
		);
		assert(
			resolved.sequenceNumber > sequenceNumberBeforeEdit,
			"the mark should resolve after the state captured before the edit",
		);
		assert.equal(
			sequencedBatches.get(mark.batchId),
			resolved.sequenceNumber,
			"the live sequencing notification should identify the resolved batch",
		);
		assert.equal(sharedMap.get("normalEdit"), true);
	});

	it("resolves a pending pre-edit mark after entering staging mode", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();

		sharedMap.set("beforeStaging", true);
		const stageControls = containerRuntime.enterStagingMode();

		const preMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			preMark.kind === "pending",
			"the unacknowledged pre-staging edit should produce a pending mark",
		);

		stageControls.commitChanges();
		await provider.ensureSynchronized();

		const resolved = await containerRuntime.versionMarkResolver.resolve(
			preMark.batchId,
			preMark.sequenceNumberLowerBound,
		);
		assert(
			resolved.kind === "resolved",
			"the pre-staging mark should resolve after its batch is sequenced",
		);
		assert.equal(sharedMap.get("beforeStaging"), true);
	});

	it("resolves a staged mark to the final staged batch", async () => {
		const { containerRuntime, sharedMap } = await createTestContext();
		const stageControls = containerRuntime.enterStagingMode();

		const preMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			preMark.kind === "resolved",
			"a mark captured before any staged edits should resolve immediately",
		);
		assert.equal(
			preMark.sequenceNumber,
			containerRuntime.deltaManager.lastSequenceNumber,
			"the pre-edit mark should sit before the staged edits",
		);

		sharedMap.set("batchA", true);
		const batchAMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(batchAMark.kind === "pending", "batch A should produce a pending mark");

		sharedMap.set("batchB", true);
		const postMark = containerRuntime.versionMarkResolver.sealAndCaptureVersionMark();
		assert(
			postMark.kind === "pending",
			"the final staged batch should produce a pending mark",
		);
		assert.notEqual(
			batchAMark.batchId,
			postMark.batchId,
			"the post-edit mark should identify the final staged batch",
		);

		stageControls.commitChanges();
		await provider.ensureSynchronized();

		const [resolvedA, resolvedPost] = await Promise.all([
			containerRuntime.versionMarkResolver.resolve(
				batchAMark.batchId,
				batchAMark.sequenceNumberLowerBound,
			),
			containerRuntime.versionMarkResolver.resolve(
				postMark.batchId,
				postMark.sequenceNumberLowerBound,
			),
		]);
		assert(resolvedA.kind === "resolved", "batch A's mark should resolve after commit");
		assert(resolvedPost.kind === "resolved", "the post-edit mark should resolve after commit");
		assert(
			resolvedA.sequenceNumber < resolvedPost.sequenceNumber,
			"the post-edit mark should resolve at the final staged batch",
		);

		assert.equal(sharedMap.get("batchA"), true);
		assert.equal(sharedMap.get("batchB"), true);
	});
});
