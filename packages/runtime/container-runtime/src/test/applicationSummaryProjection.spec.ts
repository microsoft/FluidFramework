/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	ApplicationSummaryProjectionController,
	type IApplicationSummaryProjection,
	validateApplicationSummaryProjectionKey,
} from "../summary/index.js";

function createSummaryRoot(): ISummaryTree {
	return { type: SummaryType.Tree, tree: {} };
}

function createSummaryTreeWithStats(summary: ISummaryTree) {
	return {
		summary,
		stats: {
			treeNodeCount: 0,
			blobNodeCount: 0,
			handleNodeCount: 0,
			totalBlobSize: 0,
			unreferencedBlobSize: 0,
		},
	};
}

describe("ApplicationSummaryProjectionController", () => {
	it("rejects invalid keys", () => {
		for (const key of ["", "a/b", "a\\b", ".metadata", ".channels", "gc", "prototype"]) {
			assert.throws(() => validateApplicationSummaryProjectionKey(key), UsageError);
		}
	});

	it("rejects handles without a previous summary", async () => {
		const controller = new ApplicationSummaryProjectionController({
			key: "app",
			summarize: () => ({
				summary: {
					type: SummaryType.Tree,
					tree: {
						value: {
							type: SummaryType.Handle,
							handleType: SummaryType.Blob,
							handle: "/app/value",
						},
					},
				},
			}),
		});

		await assert.rejects(
			controller.summarize(
				createSummaryTreeWithStats(createSummaryRoot()),
				{
					fullTree: false,
					trackState: true,
					referenceSequenceNumber: 1,
					previousSummary: undefined,
				},
				true,
			),
			UsageError,
		);
	});

	it("rejects promise-like onAccepted callbacks", async () => {
		const previousSummary: ISummaryContext = {
			proposalHandle: "proposal-0",
			ackHandle: "ack-0",
			referenceSequenceNumber: 0,
		};
		const controller = new ApplicationSummaryProjectionController(
			{
				key: "app",
				summarize: () => ({
					summary: {
						type: SummaryType.Tree,
						tree: {
							value: { type: SummaryType.Blob, content: "v1" },
						},
					},
					// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/no-misused-promises -- intentionally testing rejection of a promise-like return
					onAccepted: () => Promise.resolve(),
				}),
			},
			previousSummary,
		);

		const summary = createSummaryRoot();
		await controller.summarize(
			createSummaryTreeWithStats(summary),
			{ fullTree: false, trackState: true, referenceSequenceNumber: 1, previousSummary },
			true,
		);
		controller.completeSummary("proposal-1", controller.takeGeneratedSummary(summary));
		await assert.rejects(
			controller.refreshLatestSummaryAck(
				{ proposalHandle: "proposal-1", ackHandle: "ack-1", summaryRefSeq: 1 },
				true,
			),
			UsageError,
		);
	});

	it("prunes stale pending generations", async () => {
		const previousSummary: ISummaryContext = {
			proposalHandle: undefined,
			ackHandle: "ack-0",
			referenceSequenceNumber: 0,
		};
		const acknowledgments: number[] = [];
		const projection: IApplicationSummaryProjection = {
			key: "app",
			summarize: (context) => ({
				summary: {
					type: SummaryType.Tree,
					tree: {
						value: { type: SummaryType.Blob, content: `${context.referenceSequenceNumber}` },
					},
				},
				onAccepted: () => acknowledgments.push(context.referenceSequenceNumber),
			}),
		};
		const controller = new ApplicationSummaryProjectionController(projection, previousSummary);

		for (const seq of [1, 2]) {
			const summary = createSummaryRoot();
			await controller.summarize(
				createSummaryTreeWithStats(summary),
				{
					fullTree: false,
					trackState: true,
					referenceSequenceNumber: seq,
					previousSummary: controller.previousSummary,
				},
				true,
			);
			controller.completeSummary(`proposal-${seq}`, controller.takeGeneratedSummary(summary));
		}

		await controller.refreshLatestSummaryAck(
			{ proposalHandle: "proposal-2", ackHandle: "ack-2", summaryRefSeq: 2 },
			true,
		);
		assert.deepEqual(acknowledgments, [2]);
		await controller.refreshLatestSummaryAck(
			{ proposalHandle: "proposal-1", ackHandle: "ack-1", summaryRefSeq: 1 },
			true,
		);
		assert.deepEqual(acknowledgments, [2]);
	});

	it("tracks two generate submit ack cycles", async () => {
		const onAccepted: string[] = [];
		const controller = new ApplicationSummaryProjectionController({
			key: "app",
			summarize: (context) => ({
				summary: {
					type: SummaryType.Tree,
					tree: {
						value:
							context.previousSummary === undefined
								? { type: SummaryType.Blob, content: "v1" }
								: {
										type: SummaryType.Handle,
										handleType: SummaryType.Blob,
										handle: "/app/value",
									},
					},
				},
				onAccepted: (acceptedContext) => onAccepted.push(acceptedContext.ackHandle ?? ""),
			}),
		});

		for (const [seq, ack] of [
			[1, "ack-1"],
			[2, "ack-2"],
		] as const) {
			const summary = createSummaryRoot();
			await controller.summarize(
				createSummaryTreeWithStats(summary),
				{
					fullTree: false,
					trackState: true,
					referenceSequenceNumber: seq,
					previousSummary: controller.previousSummary,
				},
				true,
			);
			controller.completeSummary(`proposal-${seq}`, controller.takeGeneratedSummary(summary));
			await controller.refreshLatestSummaryAck(
				{ proposalHandle: `proposal-${seq}`, ackHandle: ack, summaryRefSeq: seq },
				true,
			);
		}

		assert.deepEqual(onAccepted, ["ack-1", "ack-2"]);
	});
});
