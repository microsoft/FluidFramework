/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import { getResolvedFluidRoot } from "@fluidframework/build-tools";
import { confirm } from "@inquirer/prompts";
import { Flags } from "@oclif/core";
import execa from "execa";
import chalk from "picocolors";
import { type AliasProposal, runAiSession } from "../library/ai/copilotSession.js";
import { BaseCommand } from "../library/commands/base.js";

export default class AiCommand extends BaseCommand<typeof AiCommand> {
	static readonly description =
		"AI-powered assistant that helps you launch the right AI agent.";

	static readonly examples = [
		{
			description: "Launch the AI assistant to help pick the right agent.",
			command: "<%= config.bin %> <%= command.id %>",
		},
		{
			description: "Use a specific model for the launcher assistant.",
			command: "<%= config.bin %> <%= command.id %> --model claude-sonnet-4.5",
		},
	];

	static readonly flags = {
		model: Flags.string({
			description: "The AI model to use for the launcher assistant.",
			default: "gpt-4.1",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		// Resolve context files
		const aliasFilePath = await this.resolveAliasFile();
		const aliasFileContent = readFileSync(aliasFilePath, "utf8");
		const gettingStartedContent = await this.readGettingStarted();

		// Create readline interface for AI conversation
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		let proposal: AliasProposal | undefined;
		try {
			proposal = await runAiSession({
				model: flags.model,
				rl,
				aliasFileContent,
				gettingStartedContent,
			});
		} catch (error) {
			this.error(`AI session failed: ${error}`, { exit: 1 });
		} finally {
			rl.close();
		}

		if (proposal === undefined) {
			this.log("No alias was selected. Exiting.");
			return;
		}

		// Display the proposal and ask for confirmation
		const formattedCommand = formatAliasCommand(proposal);
		this.log(`\n${chalk.bold("Recommended:")}`);
		this.log(`  ${chalk.green(formattedCommand)}`);
		this.log(`  ${chalk.gray(proposal.explanation)}\n`);

		const proceed = await confirm({ message: "Launch this agent?" });
		if (!proceed) {
			this.log("Cancelled.");
			return;
		}

		// Build the shell command and execute
		const shellCommand = `source '${aliasFilePath}' && ${formattedCommand}`;
		this.log(`\nLaunching ${chalk.green(proposal.alias)}...\n`);

		try {
			const result = await execa("bash", ["-c", shellCommand], {
				stdio: "inherit",
				cwd: process.cwd(),
			});
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(result.exitCode);
		} catch (error: unknown) {
			if (error !== null && typeof error === "object" && "exitCode" in error) {
				// eslint-disable-next-line unicorn/no-process-exit
				process.exit((error as { exitCode: number }).exitCode);
			}
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(1);
		}
	}

	/**
	 * Finds the agent-aliases.sh file, checking the system-wide install first
	 * (codespace), then falling back to the repo-relative path.
	 */
	private async resolveAliasFile(): Promise<string> {
		// System-wide install (AI-enabled codespace)
		const systemPath = "/usr/local/lib/agent-aliases.sh";
		if (existsSync(systemPath)) {
			return systemPath;
		}

		// Fall back to repo-relative path
		try {
			const repoRoot = await getResolvedFluidRoot();
			const repoPath = resolve(repoRoot, "scripts/codespace-setup/agent-aliases.sh");
			if (existsSync(repoPath)) {
				return repoPath;
			}
		} catch {
			// getResolvedFluidRoot may throw if not in a Fluid repo
		}

		this.error(
			"Could not find agent-aliases.sh. This command is designed for the AI-enabled Codespace.\n" +
				"See: https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace",
			{ exit: 1 },
		);
	}

	/**
	 * Reads the GETTING_STARTED.md file that describes aliases and MCP servers.
	 * Returns an empty string if the file is not found (non-fatal).
	 */
	private async readGettingStarted(): Promise<string> {
		const candidates = [resolve(process.cwd(), ".devcontainer/ai-agent/GETTING_STARTED.md")];

		try {
			const repoRoot = await getResolvedFluidRoot();
			candidates.push(resolve(repoRoot, ".devcontainer/ai-agent/GETTING_STARTED.md"));
		} catch {
			// not in a Fluid repo — skip
		}

		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				return readFileSync(candidate, "utf8");
			}
		}

		this.verbose("GETTING_STARTED.md not found; AI will rely on alias script only.");
		return "";
	}
}

/**
 * Formats an alias proposal into the shell command the user will see.
 */
function formatAliasCommand(proposal: AliasProposal): string {
	const parts = [proposal.alias];
	for (const arg of proposal.extraMcpArgs) {
		parts.push("--mcp", `'${arg}'`);
	}
	return parts.join(" ");
}
