/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ICreateBlobParams, ICreateBlobResponse } from "@fluidframework/gitresources";
import type { IHistorian } from "@fluidframework/server-services-client";

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
});
