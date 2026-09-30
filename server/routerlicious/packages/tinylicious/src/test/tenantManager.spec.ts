/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mock } from "node:test";

import type { ICreateBlobParams, ICreateBlobResponse } from "@fluidframework/gitresources";
import type { IHistorian } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

import { TinyliciousGitManager } from "../services/tenantManager";

const maxConcurrentBlobUploads = 50;

describe("TinyliciousGitManager", () => {
	it("bounds blob upload concurrency across manager instances", async () => {
		let activeBlobUploads = 0;
		let observedMaxConcurrentBlobUploads = 0;

		const createHistorian = (): IHistorian =>
			new Proxy(
				{
					endpoint: "http://localhost",
					async createBlob(params: ICreateBlobParams): Promise<ICreateBlobResponse> {
						activeBlobUploads++;
						observedMaxConcurrentBlobUploads = Math.max(
							observedMaxConcurrentBlobUploads,
							activeBlobUploads,
						);
						await new Promise<void>((resolve) => {
							setImmediate(resolve);
						});
						activeBlobUploads--;
						return {
							sha: params.content,
							url: "",
						};
					},
				} as Partial<IHistorian>,
				{
					get(target, property, receiver) {
						if (Reflect.has(target, property)) {
							return Reflect.get(target, property, receiver);
						}
						throw new Error(`Unexpected IHistorian member: ${String(property)}`);
					},
				},
			) as IHistorian;
		const managers = [
			new TinyliciousGitManager(createHistorian()),
			new TinyliciousGitManager(createHistorian()),
		];

		await Promise.all(
			managers.flatMap((manager, managerIndex) =>
				Array.from({ length: 150 }, async (_, blobIndex) =>
					manager.createBlob(`${managerIndex}-${blobIndex}`, "utf-8"),
				),
			),
		);

		assert.equal(observedMaxConcurrentBlobUploads, maxConcurrentBlobUploads);
	});

	it("continues queued blob uploads after one fails", async () => {
		const failedContent = "fail";
		const historian = new Proxy(
			{
				endpoint: "http://localhost",
				async createBlob(params: ICreateBlobParams): Promise<ICreateBlobResponse> {
					await new Promise<void>((resolve) => {
						setImmediate(resolve);
					});
					if (params.content === failedContent) {
						throw new Error("Blob upload failed");
					}
					return {
						sha: params.content,
						url: "",
					};
				},
			} as Partial<IHistorian>,
			{
				get(target, property, receiver) {
					if (Reflect.has(target, property)) {
						return Reflect.get(target, property, receiver);
					}
					throw new Error(`Unexpected IHistorian member: ${String(property)}`);
				},
			},
		) as IHistorian;
		const manager = new TinyliciousGitManager(historian);

		const results = await Promise.allSettled([
			manager.createBlob(failedContent, "utf-8"),
			...Array.from({ length: 100 }, async (_, index) =>
				manager.createBlob(`blob-${index}`, "utf-8"),
			),
		]);
		const subsequentBlob = await manager.createBlob("subsequent", "utf-8");

		assert.equal(results.filter((result) => result.status === "rejected").length, 1);
		assert.equal(results.filter((result) => result.status === "fulfilled").length, 100);
		assert.equal(subsequentBlob.sha, "subsequent");
	});

	it("logs queue length thresholds once per pressure episode", async () => {
		const warning = mock.method(Lumberjack, "warning", () => undefined);
		const info = mock.method(Lumberjack, "info", () => undefined);

		let resolveBlobUploads!: () => void;
		let blobUploads = new Promise<void>((resolve) => {
			resolveBlobUploads = resolve;
		});
		const historian = new Proxy(
			{
				endpoint: "http://localhost",
				async createBlob(params: ICreateBlobParams): Promise<ICreateBlobResponse> {
					await blobUploads;
					return {
						sha: params.content,
						url: "",
					};
				},
			} as Partial<IHistorian>,
			{
				get(target, property, receiver) {
					if (Reflect.has(target, property)) {
						return Reflect.get(target, property, receiver);
					}
					throw new Error(`Unexpected IHistorian member: ${String(property)}`);
				},
			},
		) as IHistorian;
		const manager = new TinyliciousGitManager(historian);

		try {
			const firstEpisodeUploads = Array.from({ length: 250 }, async (_, index) =>
				manager.createBlob(`first-${index}`, "utf-8"),
			);
			await new Promise<void>((resolve) => {
				setImmediate(resolve);
			});
			firstEpisodeUploads.push(
				...Array.from({ length: 10 }, async (_, index) =>
					manager.createBlob(`additional-${index}`, "utf-8"),
				),
			);

			assert.deepEqual(
				warning.mock.calls.map((call) => call.arguments),
				[
					[
						"Tinylicious blob upload queue length threshold reached",
						{
							queueLength: 100,
							queueLengthThreshold: 100,
							maxConcurrentBlobUploads,
						},
					],
					[
						"Tinylicious blob upload queue length threshold reached",
						{
							queueLength: 200,
							queueLengthThreshold: 200,
							maxConcurrentBlobUploads,
						},
					],
				],
			);

			resolveBlobUploads();
			await Promise.all(firstEpisodeUploads);

			assert.deepEqual(
				info.mock.calls.map((call) => call.arguments),
				[
					[
						"Tinylicious blob upload queue is unsaturated",
						{
							queueLength: 0,
							runningBlobUploads: 37,
							maxObservedQueueLength: 210,
							queueLengthThresholdsReached: "100,200",
							maxConcurrentBlobUploads,
						},
					],
				],
			);

			blobUploads = new Promise<void>((resolve) => {
				resolveBlobUploads = resolve;
			});
			const secondEpisodeUploads = Array.from({ length: 149 }, async (_, index) =>
				manager.createBlob(`second-${index}`, "utf-8"),
			);
			await new Promise<void>((resolve) => {
				setImmediate(resolve);
			});

			assert.equal(warning.mock.callCount(), 2);

			secondEpisodeUploads.push(manager.createBlob("second-149", "utf-8"));

			assert.deepEqual(
				warning.mock.calls.map((call) => call.arguments),
				[
					[
						"Tinylicious blob upload queue length threshold reached",
						{
							queueLength: 100,
							queueLengthThreshold: 100,
							maxConcurrentBlobUploads,
						},
					],
					[
						"Tinylicious blob upload queue length threshold reached",
						{
							queueLength: 200,
							queueLengthThreshold: 200,
							maxConcurrentBlobUploads,
						},
					],
					[
						"Tinylicious blob upload queue length threshold reached",
						{
							queueLength: 100,
							queueLengthThreshold: 100,
							maxConcurrentBlobUploads,
						},
					],
				],
			);

			resolveBlobUploads();
			await Promise.all(secondEpisodeUploads);

			assert.deepEqual(
				info.mock.calls.map((call) => call.arguments),
				[
					[
						"Tinylicious blob upload queue is unsaturated",
						{
							queueLength: 0,
							runningBlobUploads: 37,
							maxObservedQueueLength: 210,
							queueLengthThresholdsReached: "100,200",
							maxConcurrentBlobUploads,
						},
					],
					[
						"Tinylicious blob upload queue is unsaturated",
						{
							queueLength: 0,
							runningBlobUploads: 37,
							maxObservedQueueLength: 100,
							queueLengthThresholdsReached: "100",
							maxConcurrentBlobUploads,
						},
					],
				],
			);
		} finally {
			warning.mock.restore();
			info.mock.restore();
		}
	});
});
