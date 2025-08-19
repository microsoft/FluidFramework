/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import type * as ApiExtractorModule from "@microsoft/api-extractor";
import { getApiExtractorConfigFilePath } from "../taskUtils.js";
import type { WorkerExecResult, WorkerMessage } from "./worker.js";

/**
 * Worker for running API Extractor.
 * See "worker.ts" and "apiExtractorTask.ts" for more details.
 */
export async function apiExtractorWorker(message: WorkerMessage): Promise<WorkerExecResult> {
	// Load the api-extractor version that is in the cwd scope
	const apiExtractorPath = require.resolve("@microsoft/api-extractor", {
		paths: [message.cwd],
	});

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const apiExtractorModule = require(apiExtractorPath) as typeof ApiExtractorModule;

	const config = getApiExtractorConfigFilePath(message.command);
	const configPath = path.join(message.cwd, config);
	const messages: ApiExtractorModule.ExtractorMessage[] = [];
	// This assumes the version of API-Extractor we loaded at least has the these APIs.
	const result: ApiExtractorModule.ExtractorResult =
		apiExtractorModule.Extractor.loadConfigAndInvoke(configPath, {
			localBuild: message.command.includes(" --local "),
			showDiagnostics: true,
			showVerboseMessages: true,
			messageCallback: (message) => messages.push(message),
		});
	return {
		code: result.succeeded ? 0 : 1,
		error: result.succeeded
			? undefined
			: new Error(
					`Number of Errors: ${result.errorCount}. Messages: ${JSON.stringify(messages.map((m) => m.text))}`,
				),
	};
}
