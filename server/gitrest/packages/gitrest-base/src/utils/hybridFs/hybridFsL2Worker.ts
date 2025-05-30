/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Worker } from "bullmq";
import type { Cluster, Redis } from "ioredis";

import type { IFileSystemManagerFactory, IFileSystemManagerParams } from "../definitions";

export function setupHybridFsHandler(
	l2FileSystem: IFileSystemManagerFactory,
	redisClient: Redis | Cluster,
) {
	const l2AsyncWorker = new Worker(
		"l2FsWorker",
		async (job) => {
			const { args, fsParams }: { args: unknown; fsParams: IFileSystemManagerParams } =
				job.data;
			const operation = job.name;
			const l2Fs = l2FileSystem.create(fsParams).promises;
			switch (operation) {
				case "writeFile": {
					await l2Fs.writeFile(...(args as Parameters<typeof l2Fs.writeFile>));
					break;
				}

				case "mkdir": {
					const l2Result = await l2Fs.mkdir(...(args as Parameters<typeof l2Fs.mkdir>));
					Lumberjack.info("HybridFs: l2Result for mkdir", { l2Result });
					break;
				}
				default: {
					throw new Error(`Unsupported operation: ${operation}`);
				}
			}
		},
		{ connection: redisClient },
	);

	l2AsyncWorker.on("error", (error) => {
		Lumberjack.error("HybridFs: Error in l2AsyncWorker", undefined, error);
	});
}
