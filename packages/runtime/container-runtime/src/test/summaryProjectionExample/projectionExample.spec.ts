/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";

import { ApplicationSummaryProjectionController } from "../../summary/index.js";
import { TwoBlobApplicationSummaryProjectionSample } from "./projectionSample.js";

describe("Application summary projection sample", () => {
	it("reuses unchanged projected blobs via handles", async () => {
		const sample = new TwoBlobApplicationSummaryProjectionSample({ left: "A", right: "B" });
		const controller = new ApplicationSummaryProjectionController(sample.projection);

		const firstSummary: ISummaryTree = { type: SummaryType.Tree, tree: {} };
		await controller.summarize(
			{
				summary: firstSummary,
				stats: {
					treeNodeCount: 0,
					blobNodeCount: 0,
					handleNodeCount: 0,
					totalBlobSize: 0,
					unreferencedBlobSize: 0,
				},
			},
			{
				fullTree: false,
				trackState: true,
				referenceSequenceNumber: 1,
				previousSummary: undefined,
			},
			true,
		);
		const firstGeneration = controller.takeGeneratedSummary(firstSummary);
		controller.completeSummary("proposal-1", firstGeneration);
		await controller.refreshLatestSummaryAck(
			{ proposalHandle: "proposal-1", ackHandle: "ack-1", summaryRefSeq: 1 },
			true,
		);
		assert.equal(sample.onAcceptedCount, 1);

		sample.update({ left: "A2" });
		const secondSummary: ISummaryTree = { type: SummaryType.Tree, tree: {} };
		await controller.summarize(
			{
				summary: secondSummary,
				stats: {
					treeNodeCount: 0,
					blobNodeCount: 0,
					handleNodeCount: 0,
					totalBlobSize: 0,
					unreferencedBlobSize: 0,
				},
			},
			{
				fullTree: false,
				trackState: true,
				referenceSequenceNumber: 2,
				previousSummary: controller.previousSummary,
			},
			true,
		);
		const secondGeneration = controller.takeGeneratedSummary(secondSummary);
		controller.completeSummary("proposal-2", secondGeneration);

		const projection = secondSummary.tree.appProjection as ISummaryTree | undefined;
		assert(projection?.type === SummaryType.Tree);
		const left: SummaryObject | undefined = projection.tree.left;
		const right: SummaryObject | undefined = projection.tree.right;
		assert.equal(left?.type, SummaryType.Blob);
		assert.equal(right?.type, SummaryType.Handle);
		await controller.refreshLatestSummaryAck(
			{ proposalHandle: "proposal-2", ackHandle: "ack-2", summaryRefSeq: 2 },
			true,
		);
		assert.equal(sample.onAcceptedCount, 2);
	});
});
