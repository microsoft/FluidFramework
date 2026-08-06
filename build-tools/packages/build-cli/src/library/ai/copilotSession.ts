/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { approveAll, CopilotClient, defineTool } from "@github/copilot-sdk";

/**
 * A proposal from the AI for which alias to launch.
 */
export interface AliasProposal {
	alias: string;
	extraMcpArgs?: string[];
	explanation: string;
}

/**
 * UI hooks used by the interactive launcher session.
 */
export interface AiSessionUi {
	output(text: string): void;
	prompt(question: string, choices?: string[]): Promise<string>;
	info?(message: string): void;
	verbose?(message: string): void;
}

/**
 * Configuration for an interactive AI launcher session.
 */
export interface AiSessionOptions {
	model: string;
	prompt: string;
	githubToken?: string;
	ui: AiSessionUi;
}

/**
 * Runs an interactive AI session that determines which agent alias to launch.
 *
 * @param options - Session configuration.
 * @returns The alias proposal from the AI, or undefined if no alias was selected.
 */
export async function runAiSession(
	options: AiSessionOptions,
): Promise<AliasProposal | undefined> {
	const { model, prompt, githubToken, ui } = options;

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

	type CopilotSession = Awaited<ReturnType<CopilotClient["createSession"]>>;

	const client = new CopilotClient({
		...(githubToken !== undefined ? { githubToken } : {}),
		// Suppress Node's "ExperimentalWarning: SQLite is an experimental feature"
		// that the bundled Copilot CLI subprocess emits on stderr.
		env: {
			...process.env,
			NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"]
				.filter(Boolean)
				.join(" "),
		},
	});

	let session: CopilotSession | undefined;

	try {
		// Preflight: verify the Copilot CLI server starts and auth is valid.
		ui.info?.("Connecting to GitHub Copilot...");
		await preflight(client);
		ui.info?.("Authenticated.");

		ui.info?.(`Starting session (model: ${model})...`);
		session = await client.createSession({
			model,
			streaming: true,
			tools: [selectAliasTool],
			onPermissionRequest: approveAll,
			onUserInputRequest: async (request) => {
				const answer = await ui.prompt(request.question, request.choices);
				const trimmed = answer.trim();
				return {
					answer: trimmed,
					wasFreeform: !request.choices?.includes(trimmed),
				};
			},
		});
		ui.info?.("Session ready.\n");

		// Stream any explanatory text from the AI between tool calls
		session.on("assistant.message_delta", (event) => {
			ui.output(event.data.deltaContent);
		});

		// Run the conversation — the AI will ask questions via onUserInputRequest
		// and eventually call select_alias when it has enough information.
		await session.sendAndWait({ prompt });
		return proposal;
	} finally {
		if (session !== undefined) {
			try {
				await session.disconnect();
			} catch (error) {
				ui.verbose?.(`Failed to disconnect AI session cleanly: ${String(error)}`);
			}
		}

		try {
			await client.stop();
		} catch (error) {
			ui.verbose?.(`Failed to stop Copilot client cleanly: ${String(error)}`);
		}
	}
}

const AUTH_REMEDIATION =
	"Try one of:\n" +
	"  • gh auth login          (authenticate the GitHub CLI)\n" +
	"  • export GH_TOKEN=...    (set a personal access token)";

async function preflight(client: CopilotClient): Promise<void> {
	try {
		// start() must be called before ping() — the connection to the CLI server
		// is not established until start() runs.
		await client.start();
		await client.ping();
	} catch (cause) {
		throw new Error(
			`Failed to connect to the Copilot CLI server.\n` +
				`Ensure you have a GitHub Copilot subscription and are authenticated.\n\n` +
				`${AUTH_REMEDIATION}\n\nUnderlying error: ${cause}`,
		);
	}

	let authStatus;
	try {
		authStatus = await client.getAuthStatus();
	} catch (cause) {
		throw new Error(
			`GitHub Copilot authentication failed.\n` +
				`A GitHub Copilot subscription is required to use this command.\n\n` +
				`${AUTH_REMEDIATION}\n\nUnderlying error: ${cause}`,
		);
	}

	if (!authStatus.isAuthenticated) {
		throw new Error(
			`GitHub Copilot authentication failed.\n` +
				`A GitHub Copilot subscription is required to use this command.\n\n` +
				AUTH_REMEDIATION,
		);
	}
}
