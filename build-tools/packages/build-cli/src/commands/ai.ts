/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import { getResolvedFluidRoot } from "@fluidframework/build-tools";
import { confirm } from "@inquirer/prompts";
import { Flags } from "@oclif/core";
import execa from "execa";
import matter from "gray-matter";
import chalk from "picocolors";
import { type AliasProposal, runAiSession } from "../library/ai/copilotSession.js";
import { BaseCommand } from "../library/commands/base.js";

const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
export const supportedAliases = ["claude", "dev", "copilot", "oce", "ai-reset"] as const;
const supportedAliasSet = new Set<string>(supportedAliases);

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
		aliasFile: Flags.file({
			description:
				"Path to the agent-aliases.sh file. Defaults to the AI-enabled Codespace locations.",
			exists: true,
			env: "FLUB_AI_ALIAS_FILE",
		}),
		githubToken: Flags.string({
			description:
				"GitHub token for the launcher assistant. Defaults to COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN.",
			env: "COPILOT_GITHUB_TOKEN",
		}),
		model: Flags.string({
			description:
				"The AI model to use for the launcher assistant. " +
				"Defaults to the model specified in launcher-prompt.md frontmatter.",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { flags } = this;

		const repoRoot = await this.tryResolveRepoRoot();
		this.verbose(`Repo root: ${repoRoot ?? "(not in a Fluid repo)"}`);

		const [aliasFile, gettingStartedContent, promptFile] = await Promise.all([
			this.resolveAliasFile(repoRoot, flags.aliasFile),
			this.readDevcontainerFile(repoRoot, "GETTING_STARTED.md"),
			this.loadPromptFile(repoRoot),
		]);
		this.verbose(`Alias file: ${aliasFile.path}`);

		const model = flags.model ?? promptFile.model ?? FALLBACK_MODEL;
		this.verbose(
			`Model: ${model} (source: ${flags.model ? "flag" : promptFile.model ? "frontmatter" : "fallback"})`,
		);

		const prompt = promptFile.template
			.replaceAll("{{aliasFileContent}}", aliasFile.content)
			.replaceAll("{{gettingStartedContent}}", gettingStartedContent ?? "");
		const githubToken = flags.githubToken ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const quiet = this.flags.quiet;
		const log = this.log.bind(this);
		const verbose = this.verbose.bind(this);

		let proposal: AliasProposal | undefined;
		try {
			proposal = await runAiSession({
				model,
				prompt,
				githubToken,
				ui: {
					output: (text: string) => {
						if (!quiet) {
							process.stdout.write(text);
						}
					},
					prompt: async (question: string, choices?: string[]) => {
						log(`\n${chalk.cyan(question)}`);
						if (choices !== undefined && choices.length > 0) {
							for (const [index, choice] of choices.entries()) {
								log(`  ${chalk.yellow(`${index + 1}.`)} ${choice}`);
							}
						}

						const answer = await rl.question(chalk.gray("\n> "));
						return normalizePromptAnswer(answer, choices);
					},
					verbose: (message: string) => {
						verbose(message);
					},
				},
			});
		} catch (error: unknown) {
			if (isUserCancellation(error)) {
				this.log("\nCancelled.");
				return;
			}
			this.error(`AI session failed: ${error}`, { exit: 1 });
		} finally {
			rl.close();
		}

		if (proposal === undefined) {
			this.log("No alias was selected. Exiting.");
			return;
		}

		try {
			assertSafeAliasSelection(proposal);
		} catch (error: unknown) {
			this.error(error instanceof Error ? error.message : String(error), { exit: 1 });
		}
		const formattedCommand = formatAliasCommand(proposal);
		this.log(`\n${chalk.bold("Recommended:")}`);
		this.log(`  ${chalk.green(formattedCommand)}`);
		this.log(`  ${chalk.gray(proposal.explanation)}\n`);

		let proceed = false;
		try {
			proceed = await confirm({ message: "Launch this agent?" });
		} catch (error: unknown) {
			if (isUserCancellation(error)) {
				this.log("\nCancelled.");
				return;
			}

			this.error(`Failed to read confirmation: ${error}`, { exit: 1 });
		}

		if (!proceed) {
			this.log("Cancelled.");
			return;
		}

		const shellCommand = `source ${shellQuote(aliasFile.path)} && ${formattedCommand}`;
		this.verbose(`Shell command: ${shellCommand}`);
		this.log(`\nLaunching ${chalk.green(proposal.alias)}...\n`);

		try {
			const result = await execa("bash", ["-c", shellCommand], {
				stdio: "inherit",
				cwd: process.cwd(),
			});
			this.exit(result.exitCode ?? 0);
		} catch (error: unknown) {
			const execError = error as execa.ExecaError;
			const exitCode = execError.exitCode ?? 1;
			const errorMessage =
				execError.shortMessage ?? (error instanceof Error ? error.message : undefined);

			this.errorLog(
				errorMessage === undefined || errorMessage.length === 0
					? `Failed to launch ${proposal.alias}.`
					: `Failed to launch ${proposal.alias}: ${errorMessage}`,
			);
			this.exit(exitCode);
		}
	}

	private async tryResolveRepoRoot(): Promise<string | undefined> {
		try {
			return await getResolvedFluidRoot();
		} catch {
			return undefined;
		}
	}

	/**
	 * Finds and reads agent-aliases.sh. Checks the system-wide install first
	 * (codespace), then falls back to the repo-relative path.
	 */
	private async resolveAliasFile(
		repoRoot: string | undefined,
		preferredPath?: string,
	): Promise<{ path: string; content: string }> {
		const candidates: string[] = [];
		if (preferredPath !== undefined) {
			candidates.push(preferredPath);
		}
		candidates.push("/usr/local/lib/agent-aliases.sh");
		if (repoRoot !== undefined) {
			candidates.push(resolve(repoRoot, "scripts/codespace-setup/agent-aliases.sh"));
		}

		for (const candidate of candidates) {
			this.verbose(`Checking for alias file: ${candidate}`);
			const content = await tryReadFile(candidate);
			if (content !== undefined) {
				return { path: candidate, content };
			}
		}

		this.error(
			"Could not find agent-aliases.sh. This command is designed for the AI-enabled Codespace.\n" +
				"See: https://github.com/microsoft/FluidFramework/wiki/AI%E2%80%90enabled-Codespace",
			{ exit: 1 },
		);
	}

	/**
	 * Reads a file from the devcontainer ai-agent directories, checking
	 * ai-agent-insiders/ first then ai-agent/ in both cwd and repoRoot.
	 */
	private async readDevcontainerFile(
		repoRoot: string | undefined,
		filename: string,
	): Promise<string | undefined> {
		const dirs = [".devcontainer/ai-agent-insiders", ".devcontainer/ai-agent"];
		const candidates: string[] = [];
		const seen = new Set<string>();
		for (const base of [process.cwd(), repoRoot]) {
			if (base === undefined) continue;
			for (const dir of dirs) {
				const candidate = resolve(base, dir, filename);
				if (!seen.has(candidate)) {
					seen.add(candidate);
					candidates.push(candidate);
				}
			}
		}

		for (const candidate of candidates) {
			this.verbose(`Looking for ${filename}: ${candidate}`);
			const content = await tryReadFile(candidate);
			if (content !== undefined) {
				this.verbose(`Found ${filename}: ${candidate}`);
				return content;
			}
		}
		this.verbose(`${filename} not found in any candidate location.`);
		return undefined;
	}

	/**
	 * Loads the launcher prompt template and its frontmatter config.
	 * Falls back to a minimal default if the file is not found.
	 */
	private async loadPromptFile(
		repoRoot: string | undefined,
	): Promise<{ template: string; model?: string }> {
		const raw = await this.readDevcontainerFile(repoRoot, "launcher-prompt.md");
		if (raw !== undefined) {
			try {
				const { data, content } = matter(raw);
				return {
					template: content.trim(),
					model: typeof data.model === "string" ? data.model : undefined,
				};
			} catch (error) {
				this.warn(
					`Failed to parse launcher-prompt.md frontmatter; using raw file contents instead: ${String(error)}`,
				);
				return { template: raw.trim() };
			}
		}

		this.warn("launcher-prompt.md not found; using hardcoded fallback prompt.");
		return {
			template:
				"You are a launcher assistant. Ask the user what they want to do, " +
				"then call select_alias with the best alias from the alias definitions.\n\n" +
				"## Alias Definitions\n\n```bash\n{{aliasFileContent}}\n```\n\n" +
				"## Getting Started Guide\n\n{{gettingStartedContent}}",
		};
	}
}

export function assertSafeAliasSelection(proposal: AliasProposal): void {
	if (!supportedAliasSet.has(proposal.alias)) {
		throw new Error(
			`Unsupported AI alias selection: ${proposal.alias}. Allowed aliases: ${supportedAliases.join(", ")}`,
		);
	}
}

function formatAliasCommand(proposal: AliasProposal): string {
	const parts = [shellQuote(proposal.alias)];
	if (proposal.extraMcpArgs !== undefined) {
		for (const arg of proposal.extraMcpArgs) {
			parts.push("--mcp", shellQuote(arg));
		}
	}
	return parts.join(" ");
}

/**
 * Wraps a value in single quotes with proper escaping for bash.
 * Embedded single quotes are handled via the '\'' idiom.
 */
function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function normalizePromptAnswer(answer: string, choices?: string[]): string {
	const trimmed = answer.trim();
	if (choices === undefined || choices.length === 0) {
		return trimmed;
	}

	if (/^\d+$/.test(trimmed)) {
		const selectedIndex = Number.parseInt(trimmed, 10) - 1;
		if (selectedIndex >= 0 && selectedIndex < choices.length) {
			return choices[selectedIndex];
		}
	}

	return trimmed;
}

function isUserCancellation(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "ExitPromptError" ||
			error.name === "AbortError" ||
			/cancel|canceled|cancelled|aborted|sigint/i.test(error.message))
	);
}

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

		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read ${filePath}: ${message}`, { cause: error });
	}
}
