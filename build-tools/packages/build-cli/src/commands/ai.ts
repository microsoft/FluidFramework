/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { access, readFile } from "node:fs/promises";
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

		const repoRoot = await this.tryResolveRepoRoot();
		const [aliasFilePath, gettingStartedContent] = await Promise.all([
			this.resolveAliasFile(repoRoot),
			this.readGettingStarted(repoRoot),
		]);
		const aliasFileContent = await readFile(aliasFilePath, "utf8");

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

		const formattedCommand = formatAliasCommand(proposal);
		this.log(`\n${chalk.bold("Recommended:")}`);
		this.log(`  ${chalk.green(formattedCommand)}`);
		this.log(`  ${chalk.gray(proposal.explanation)}\n`);

		const proceed = await confirm({ message: "Launch this agent?" });
		if (!proceed) {
			this.log("Cancelled.");
			return;
		}

		const shellCommand = `source '${aliasFilePath}' && ${formattedCommand}`;
		this.log(`\nLaunching ${chalk.green(proposal.alias)}...\n`);

		try {
			const result = await execa("bash", ["-c", shellCommand], {
				stdio: "inherit",
				cwd: process.cwd(),
			});
			this.exit(result.exitCode);
		} catch (error: unknown) {
			if (error !== null && typeof error === "object" && "exitCode" in error) {
				this.exit((error as { exitCode: number }).exitCode);
			}
			this.exit(1);
		}
	}

	/**
	 * Attempts to resolve the Fluid repo root. Returns undefined if not in a Fluid repo.
	 */
	private async tryResolveRepoRoot(): Promise<string | undefined> {
		try {
			return await getResolvedFluidRoot();
		} catch {
			return undefined;
		}
	}

	/**
	 * Finds the agent-aliases.sh file, checking the system-wide install first
	 * (codespace), then falling back to the repo-relative path.
	 */
	private async resolveAliasFile(repoRoot: string | undefined): Promise<string> {
		const systemPath = "/usr/local/lib/agent-aliases.sh";
		if (await fileExists(systemPath)) {
			return systemPath;
		}

		if (repoRoot !== undefined) {
			const repoPath = resolve(repoRoot, "scripts/codespace-setup/agent-aliases.sh");
			if (await fileExists(repoPath)) {
				return repoPath;
			}
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
	private async readGettingStarted(repoRoot: string | undefined): Promise<string> {
		const candidates = [resolve(process.cwd(), ".devcontainer/ai-agent/GETTING_STARTED.md")];

		if (repoRoot !== undefined) {
			candidates.push(resolve(repoRoot, ".devcontainer/ai-agent/GETTING_STARTED.md"));
		}

		for (const candidate of candidates) {
			const content = await tryReadFile(candidate);
			if (content !== undefined) {
				return content;
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
	if (proposal.extraMcpArgs !== undefined) {
		for (const arg of proposal.extraMcpArgs) {
			parts.push("--mcp", `'${arg}'`);
		}
	}
	return parts.join(" ");
}

/**
 * Reads a file, returning undefined if it does not exist (ENOENT).
 */
async function tryReadFile(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error: unknown) {
		if (
			error !== null &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return undefined;
		}
		throw error;
	}
}

/**
 * Checks whether a file exists using async fs.access.
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}
