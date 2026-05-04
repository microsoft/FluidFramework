/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { TreeViewConfiguration } from "@fluidframework/tree";
import { independentView } from "@fluidframework/tree/alpha";
import { SharedTreeSemanticAgent } from "@fluidframework/tree-agent/alpha";

import { OpenAiChatModel } from "./openAiChatModel.js";
import { sampleSprintBoard } from "./sampleData.js";
import { SprintBoard } from "./schema.js";

async function main(): Promise<void> {
	const credential = new DefaultAzureCredential();
	const azureADTokenProvider = getBearerTokenProvider(
		credential,
		"https://cognitiveservices.azure.com/.default",
	);

	const view = independentView(new TreeViewConfiguration({ schema: SprintBoard }));
	view.initialize(sampleSprintBoard());

	const chatModel = new OpenAiChatModel({ azureADTokenProvider });
	const agent = new SharedTreeSemanticAgent(chatModel, view, {
		domainHints:
			"This is a sprint planning board for an agile software development team. " +
			"Work items have statuses: todo, in-progress, in-review, done. " +
			"Priorities are: critical, high, medium, low. " +
			"Story points use Fibonacci numbers: 1, 2, 3, 5, 8, 13.",
		logger: { log: (text) => process.stdout.write(text) },
	});

	const queries = [
		"Create a new work item titled 'Add dark mode support' with high priority and assign it to Bob",
		"Move 'Design database schema' from in-review to done",
		"What is the total story points assigned to Alice?",
	];

	for (const query of queries) {
		console.log(`\n${"=".repeat(60)}`);
		console.log(`Query: ${query}`);
		console.log("=".repeat(60));
		const response = await agent.query(query);
		console.log(`\nResponse: ${response}`);
	}

	console.log("\nFinal board state:");
	console.log(JSON.stringify(view.root, undefined, 2));
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
