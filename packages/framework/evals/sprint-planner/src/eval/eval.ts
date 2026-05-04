/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
	DefaultAzureCredential,
	InteractiveBrowserCredential,
	getBearerTokenProvider,
} from "@azure/identity";
import type { TokenCredential } from "@azure/identity";
import { createEvalServer } from "@ff-internal/eval-app";

import { createRunGeneration } from "./evalGeneration.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(thisDir, "../..");

const datasetsDir = path.join(packageRoot, "datasets");
const resultsDir = path.join(packageRoot, "results");

const scope = "https://cognitiveservices.azure.com/.default";

let sharedCredential: TokenCredential = new DefaultAzureCredential();

createEvalServer({
	appName: "Sprint Planner Eval",
	datasetsDir,
	resultsDir,
	defaultGeneratorModel: "gpt-4o-mini",
	defaultJudgeModel: "gpt-4o-mini",
	modelOptions: ["gpt-4o-mini"],
	customGenerationProperties: {
		// Example of a custom property that can be set at generation time and will be included in the result.json
		// and summary.md files, and can be used for filtering and grouping in the eval app UI.
		colorFilter: ["red", "blue", "green"],
	},
	runGeneration: async (request, progress, signal) => {
		const credential = sharedCredential;
		return createRunGeneration(datasetsDir, resultsDir, credential)(request, progress, signal);
	},
	checkAuth: async () => {
		const credential = sharedCredential;
		try {
			const tokenProvider = getBearerTokenProvider(credential, scope);
			await tokenProvider();
			return true;
		} catch {
			return false;
		}
	},
	runAuth: async (progress) => {
		try {
			const credential = new InteractiveBrowserCredential({});
			const tokenProvider = getBearerTokenProvider(credential, scope);
			await tokenProvider();
			sharedCredential = credential;
			progress.progress("Azure identity authentication successful.");
		} catch (error) {
			throw new Error(
				"Azure identity authentication failed. " +
					`Error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	},
});
