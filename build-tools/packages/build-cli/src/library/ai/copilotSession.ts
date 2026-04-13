/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Interface as ReadlineInterface } from "node:readline/promises";

import { approveAll, CopilotClient, defineTool } from "@github/copilot-sdk";
import chalk from "picocolors";

/**
 * A proposal from the AI for which alias to launch.
 */
export interface AliasProposal {
	alias: string;
	extraMcpArgs?: string[];
	explanation: string;
}

/**
 * Runs an interactive AI session that determines which agent alias to launch.
 *
 * @param options - Session configuration.
 * @returns The alias proposal from the AI, or undefined if no alias was selected.
 */
export async function runAiSession(options: {
	model: string;
	rl: ReadlineInterface;
	prompt: string;
}): Promise<AliasProposal | undefined> {
	const { model, rl, prompt } = options;

	let proposal: AliasProposal | undefined;

	const selectAliasTool = defineTool("select_alias", {
		description:
			"Call this when you have determined the right alias and MCP configuration for the user's task. This ends the conversation and presents the recommendation to the user for confirmation.",
		parameters: {
			type: "object",
			properties: {
				alias: {
					type: "string",
					description:
						"The alias to launch. Must be a function name from the agent-aliases.sh script.",
				},
				extraMcpArgs: {
					type: "array",
					items: { type: "string" },
					description:
						'Additional MCP server arguments (values only, not the --mcp flag itself). Example: ["kusto --service-uri https://kusto.aria.microsoft.com"]',
				},
				explanation: {
					type: "string",
					description: "Brief explanation of why this alias was chosen.",
				},
			},
			required: ["alias", "explanation"],
		},
		handler: async (args: { alias: string; extraMcpArgs?: string[]; explanation: string }) => {
			proposal = {
				alias: args.alias,
				extraMcpArgs: args.extraMcpArgs,
				explanation: args.explanation,
			};
			return "Alias selection recorded. The user will be asked to confirm.";
		},
		skipPermission: true,
	});

	// Resolve a GitHub token from environment if available.
	const githubToken =
		process.env.COPILOT_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

	const client = new CopilotClient({
		...(githubToken !== undefined ? { githubToken } : {}),
	});

	try {
		// Preflight: verify the Copilot CLI server starts and auth is valid.
		await preflight(client);

		const session = await client.createSession({
			model,
			streaming: true,
			tools: [selectAliasTool],
			onPermissionRequest: approveAll,
			onUserInputRequest: async (request) => {
				// Display the AI's question
				console.log(`\n${chalk.cyan(request.question)}`);

				// Show numbered choices if provided
				if (request.choices && request.choices.length > 0) {
					for (const [i, choice] of request.choices.entries()) {
						console.log(`  ${chalk.yellow(`${i + 1}.`)} ${choice}`);
					}
				}

				const answer = await rl.question(chalk.gray("\n> "));
				const trimmed = answer.trim();
				return {
					answer: trimmed,
					wasFreeform: !request.choices?.includes(trimmed),
				};
			},
		});

		// Stream any explanatory text from the AI between tool calls
		session.on("assistant.message_delta", (event) => {
			process.stdout.write(event.data.deltaContent);
		});

		// Run the conversation — the AI will ask questions via onUserInputRequest
		// and eventually call select_alias when it has enough information.
		await session.sendAndWait({ prompt });

		await session.disconnect();
		return proposal;
	} finally {
		await client.stop();
	}
}

/**
 * Verifies that the Copilot CLI server is reachable and the user is authenticated.
 * Throws a descriptive error if either check fails.
 */
async function preflight(client: CopilotClient): Promise<void> {
	try {
		await client.ping();
	} catch (cause) {
		throw new Error(
			"Failed to connect to the Copilot CLI server.\n" +
				"Ensure you have a GitHub Copilot subscription and are authenticated.\n\n" +
				"Try one of:\n" +
				"  • gh auth login\n" +
				"  • Set the GH_TOKEN or GITHUB_TOKEN environment variable\n\n" +
				`Underlying error: ${cause}`,
		);
	}

	let authStatus;
	try {
		authStatus = await client.getAuthStatus();
	} catch (cause) {
		throw new Error(
			"GitHub Copilot authentication failed.\n" +
				"A GitHub Copilot subscription is required to use this command.\n\n" +
				"Try one of:\n" +
				"  • gh auth login          (authenticate the GitHub CLI)\n" +
				"  • export GH_TOKEN=...    (set a personal access token)\n\n" +
				`Underlying error: ${cause}`,
		);
	}

	if (!authStatus.isAuthenticated) {
		throw new Error(
			"GitHub Copilot authentication failed.\n" +
				"A GitHub Copilot subscription is required to use this command.\n\n" +
				"Try one of:\n" +
				"  • gh auth login          (authenticate the GitHub CLI)\n" +
				"  • export GH_TOKEN=...    (set a personal access token)\n",
		);
	}
}
