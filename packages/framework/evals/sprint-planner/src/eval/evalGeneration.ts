/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { TokenCredential } from "@azure/identity";
import { getBearerTokenProvider } from "@azure/identity";
import type {
	RunGenerationRequest,
	RunGenerationResult,
	ProgressReporter,
} from "@fluidframework/eval-app";
import type {
	Rubric,
	ScenarioArtifact,
	DatasetArtifact,
	JsonObject,
} from "@fluidframework/eval-framework";
import { TreeViewConfiguration } from "@fluidframework/tree";
import { TreeAlpha, independentView } from "@fluidframework/tree/alpha";
import { SharedTreeSemanticAgent } from "@fluidframework/tree-agent/alpha";

import { OpenAiJudgeClient } from "../llmClient.js";
import { OpenAiChatModel } from "../openAiChatModel.js";
import { sampleSprintBoard } from "../sampleData.js";
import { SprintBoard } from "../schema.js";

/**
 * A single test case within a dataset config file.
 */
export interface DatasetEntry {
	name: string;
	prompt: string;
}

/**
 * The structure of a dataset JSON file in the datasets/ directory.
 */
export interface DatasetConfig {
	name: string;
	metadata: JsonObject;
	domainHints: string;
	datasets: DatasetEntry[];
	rubrics: Rubric[];
	dataInterpretationPrompt: string;
}

/**
 * Loads and parses a dataset config JSON file.
 */
export function loadDatasetConfig(datasetsDir: string, datasetFile: string): DatasetConfig {
	const filePath = path.resolve(datasetsDir, path.basename(datasetFile));
	if (!filePath.startsWith(path.resolve(datasetsDir))) {
		throw new Error("Invalid dataset file path");
	}
	const content = fs.readFileSync(filePath, "utf8");
	return JSON.parse(content) as DatasetConfig;
}

/**
 * Builds a {@link ScenarioArtifact} from a dataset config and generation outputs.
 */
export function buildScenarioArtifact(
	config: DatasetConfig,
	datasetOutputs: { name: string; input: JsonObject; output: JsonObject }[],
	modelType: string,
): ScenarioArtifact {
	const datasetArtifacts: DatasetArtifact[] = datasetOutputs.map((ds) => ({
		name: ds.name,
		input: ds.input,
		output: ds.output,
		metadata: {},
	}));

	return {
		name: config.name,
		llmEvalConfig: {
			rubrics: config.rubrics,
			dataInterpretationPrompt: config.dataInterpretationPrompt,
		},
		datasetArtifacts,
		modelType,
		metadata: config.metadata ?? {},
	};
}

/**
 * Creates the `runGeneration` callback for the eval server.
 */
export function createRunGeneration(
	datasetsDir: string,
	resultsDir: string,
	credential: TokenCredential,
) {
	const azureADTokenProvider = getBearerTokenProvider(
		credential,
		"https://cognitiveservices.azure.com/.default",
	);

	return async (
		request: RunGenerationRequest,
		progress: ProgressReporter,
		signal: AbortSignal,
	): Promise<RunGenerationResult> => {
		const config = loadDatasetConfig(datasetsDir, request.dataset);
		progress.progress(`Loaded dataset config: ${config.name}`);

		const datasetOutputs: { name: string; input: JsonObject; output: JsonObject }[] = [];

		for (const entry of config.datasets) {
			signal.throwIfAborted();

			progress.progress(`Running scenario: ${entry.name}`);
			progress.progress(`Prompt: ${entry.prompt}`);

			// Create an independent Fluid tree view with sample data
			const view = independentView(new TreeViewConfiguration({ schema: SprintBoard }));
			view.initialize(sampleSprintBoard());

			// Export the initial tree state
			const initialTreeState = TreeAlpha.exportVerbose(view.root);

			// Create the chat model and agent
			const chatModel = new OpenAiChatModel({
				azureADTokenProvider,
				deployment: request.model,
			});
			const agent = new SharedTreeSemanticAgent(chatModel, view, {
				domainHints: config.domainHints,
			});

			// Run the agent
			const response = await agent.query(entry.prompt);
			progress.progress(`Agent response: ${response.slice(0, 200)}`);

			// Export the final tree state
			const finalTreeState = TreeAlpha.exportVerbose(view.root);

			datasetOutputs.push({
				name: entry.name,
				input: {
					prompt: entry.prompt,
					domainHints: config.domainHints,
					treeState: initialTreeState as unknown as JsonObject,
				},
				output: {
					treeState: finalTreeState as unknown as JsonObject,
				},
			});
		}

		// Build the scenario artifact
		const scenario = buildScenarioArtifact(config, datasetOutputs, request.model);

		// Create the judge LLM client
		const llmClient = new OpenAiJudgeClient({
			azureADTokenProvider,
			deployment: request.judgeModel,
		});

		return { scenario, resultsDirPath: resultsDir, llmClient };
	};
}
