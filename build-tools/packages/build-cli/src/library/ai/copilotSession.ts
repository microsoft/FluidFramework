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
 * Builds the initial prompt from the runtime context files.
 */
function buildInitialPrompt(aliasFileContent: string, gettingStartedContent: string): string {
	return `You are a launcher assistant for the Fluid Framework. Your job is to help the user pick the right AI agent alias and MCP server configuration for their task.

## Your Behavior
1. Greet the user briefly and ask what they want to accomplish today. Use the ask_user tool.
2. Ask clarifying questions if needed to understand their task. Use ask_user for every question.
3. Once you know enough, call select_alias with your recommendation.
4. NEVER recommend aliases that don't exist in the alias definitions below.
5. Keep the conversation short — usually 1-2 questions is enough.

## Alias Definitions (source of truth)

The following shell script defines the available aliases. Each shell function IS an alias.
Study the function bodies to understand what each alias does (which agent it launches,
which overlays it applies, which MCP servers it includes by default).

\`\`\`bash
${aliasFileContent}
\`\`\`

## Getting Started Guide

The following guide is shown to users when they first start working.
Use it to understand the aliases, MCP server options, and recommended workflows.

${gettingStartedContent}

## Guidelines
- ONLY recommend aliases that exist as functions in the alias definitions above.
- When calling select_alias, the alias value must exactly match a function name from the script.
- Most developers doing feature work should use \`dev\`.
- For OCE/incident work, always recommend \`oce\`.
- For general questions or exploration without a specific workflow, recommend \`claude\`.
- Only suggest \`ai-reset\` if the user explicitly mentions overlay problems.
- Don't overload with MCP servers — only suggest extras if the task clearly needs them.
- When in doubt between \`dev\` and \`claude\`, prefer \`dev\` for any coding task.

---

Begin now. Greet the user and ask what they'd like to do today. Use ask_user.`;
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
	aliasFileContent: string;
	gettingStartedContent: string;
}): Promise<AliasProposal | undefined> {
	const { model, rl, aliasFileContent, gettingStartedContent } = options;

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
		const prompt = buildInitialPrompt(aliasFileContent, gettingStartedContent);
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
