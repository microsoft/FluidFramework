/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Package } from "@fluidframework/build-tools";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import humanId from "human-id";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { format as prettier } from "prettier";
import prompts from "prompts";

import { BaseCommand } from "../../base";
import { Repository, getDefaultBumpTypeForBranch } from "../../lib";

const DEFAULT_BRANCH = "main";
const INSTRUCTIONS = `
↑/↓: Change selection
Space: Toggle selection
a: Toggle all
Enter: Done`;

/**
 * Package scopes that will be excluded by default. The default list contains scopes that are not typically published to
 * a public registry, and thus are the least likely to have a changeset-relevant change.
 */
const excludedScopes = new Set(["@fluid-example", "@fluid-internal", "@fluid-test"]);

/**
 * Represents a choice in the CLI prompt UX.
 */
interface Choice {
	title: string;
	value?: Package;
	disabled?: boolean;
	selected?: boolean;
	heading?: boolean;
}

export default class GenerateChangesetCommand extends BaseCommand<typeof GenerateChangesetCommand> {
	static summary = `Generates a new changeset file. You will be prompted to select the packages affected by this change. You can also create an empty changeset to include with this change that can be updated later.`;
	static aliases: string[] = [
		// 'cangesets add' is the changesets cli command.
		"changeset:add",
	];

	// Enables the global JSON flag in oclif.
	static enableJsonFlag = true;

	static flags = {
		branch: Flags.string({
			char: "b",
			description: `The branch to compare the current changes against. The current changes will be compared with this branch to populate the list of changed packages. ${chalk.bold(
				"You must have a valid remote pointing to the microsoft/FluidFramework repo.",
			)}`,
			default: DEFAULT_BRANCH,
		}),
		empty: Flags.boolean({
			description: `Create an empty changeset file. If this flag is used, all other flags are ignored. A new, randomly named changeset file will be created every time --empty is used.`,
		}),
		all: Flags.boolean({
			description: `Include ALL packages, including examples and other unpublished packages.`,
			default: false,
		}),
		uiMode: Flags.string({
			description: `Controls the mode in which the interactive UI is displayed. The 'default' mode includes an autocomplete filter to narrow the list of packages. The 'simple' mode does not include the autocomplete filter, but has better UI that may display better in some terminal configurations. This flag is experimental and may change or be removed at any time.`,
			default: "default",
			options: ["default", "simple"],
			helpGroup: "EXPERIMENTAL",
		}),
		...BaseCommand.flags,
	};

	static examples = [
		{
			description: "Create an empty changeset using the --empty flag.",
			command: "<%= config.bin %> <%= command.id %> --empty",
		},
		{
			description: `Create a changeset interactively. Any package whose contents has changed relative to the '${DEFAULT_BRANCH}' branch will be selected by default.`,
			command: "<%= config.bin %> <%= command.id %>",
		},
		{
			description: `You can compare with a different branch using --branch (-b).`,
			command: "<%= config.bin %> <%= command.id %> --branch next",
		},
		{
			description: `By default example and private packages are excluded, but they can be included with --all.`,
			command: "<%= config.bin %> <%= command.id %> --all",
		},
	];

	public async run(): Promise<{
		branch: string;
		selectedPackages: string[];
		changesetPath?: string;
	}> {
		const context = await this.getContext();
		const { all, branch, empty, uiMode } = this.flags;

		if (empty) {
			const emptyFile = await createChangesetFile(context.gitRepo.resolvedRoot, new Map());
			// eslint-disable-next-line @typescript-eslint/no-shadow
			const changesetPath = path.relative(context.gitRepo.resolvedRoot, emptyFile);
			this.logHr();
			this.log(`Created empty changeset: ${chalk.green(changesetPath)}`);
			return {
				branch,
				selectedPackages: [],
				changesetPath,
			};
		}

		const repo = new Repository({ baseDir: context.gitRepo.resolvedRoot });
		// context.originRemotePartialUrl is 'microsoft/FluidFramework'; see BaseCommand.getContext().
		const remote = await repo.getRemote(context.originRemotePartialUrl);

		if (remote === undefined) {
			// Logs and exits
			this.error(`Can't find a remote with ${context.originRemotePartialUrl}`, { exit: 1 });
		}
		this.log(`Remote for ${context.originRemotePartialUrl} is: ${chalk.bold(remote)}`);

		const {
			packages: changedPackages,
			files: changedFiles,
			releaseGroups: changedReleaseGroups,
		} = await repo.getChangedSinceRef(branch, remote, context);

		this.verbose(`release groups: ${changedReleaseGroups.join(", ")}`);
		this.verbose(`packages: ${changedPackages.map((p) => p.name).join(", ")}`);
		this.verbose(`files: ${changedFiles.join(", ")}`);

		if (changedFiles.length === 0) {
			this.error(`No changes when compared to ${branch}.`, { exit: 1 });
		}

		if (changedPackages.length === 0) {
			this.error(`No changed packages when compared to ${branch}.`, { exit: 1 });
		}

		if (changedReleaseGroups.length > 1) {
			this.warning(
				`More than one release group changed when compared to ${branch}. Is this expected?`,
			);
		}

		const choices: Choice[] = [];

		// Handle changed release groups first so they show up in the list first.
		for (const rgName of changedReleaseGroups) {
			const rg = context.repo.releaseGroups.get(rgName);
			if (rg === undefined) {
				this.error(`Release group ${rgName} not found in repo config`, { exit: 1 });
			}

			choices.push(
				{ title: `${chalk.bold(rg.kind)}`, heading: true, disabled: true },
				...rg.packages
					.filter((pkg) => (all ? true : isIncludedByDefault(pkg)))
					.sort((a, b) =>
						a.nameUnscoped < b.nameUnscoped ? -1 : a.name === b.name ? 0 : 1,
					)
					.map((pkg) => {
						const changed = changedPackages.some((cp) => cp.name === pkg.name);
						return {
							title: changed
								? `${pkg.name} ${chalk.red.bold("(changed)")}`
								: pkg.name,
							value: pkg,
							selected: changed,
						};
					}),
			);
		}

		// Next list independent packages in a group
		choices.push({ title: chalk.bold("Independent Packages"), heading: true, disabled: true });
		for (const pkg of context.independentPackages) {
			if (!all && !isIncludedByDefault(pkg)) {
				continue;
			}
			const changed = changedPackages.some((cp) => cp.name === pkg.name);
			choices.push({
				title: changed ? `${pkg.name} ${chalk.red.bold("(changed)")}` : pkg.name,
				value: pkg,
				selected: changed,
			});
		}

		// Finally list the remaining (unchanged) release groups and their packages
		for (const rg of context.repo.releaseGroups.values()) {
			if (!changedReleaseGroups.includes(rg.kind)) {
				choices.push(
					{ title: `${chalk.bold(rg.kind)}`, heading: true, disabled: true },
					...rg.packages
						.filter((pkg) => (all ? true : isIncludedByDefault(pkg)))
						.sort((a, b) =>
							a.nameUnscoped < b.nameUnscoped ? -1 : a.name === b.name ? 0 : 1,
						)
						.map((pkg) => {
							return {
								title: pkg.name,
								value: pkg,
								selected: false,
							};
						}),
				);
			}
		}

		const questions: prompts.PromptObject[] = [
			{
				name: "selectedPackages",
				type: uiMode === "default" ? "autocompleteMultiselect" : "multiselect",
				choices: [...choices, { title: " ", heading: true, disabled: true }],
				instructions: INSTRUCTIONS,
				message:
					"Choose which packages to include in the changeset. Type to filter the list.",
				optionsPerPage: 5,
				onState: (state: any) => {
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			} as any, // Typed as any because the typings don't include the optionsPerPage property.
			{
				name: "summary",
				type: "text",
				message: "Enter a summary of the change.",
				onState: (state: any) => {
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
			{
				name: "description",
				type: "text",
				message: "Enter a longer description of the change.",
				onState: (state: any) => {
					// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
		];

		const response = await prompts(questions);
		const selectedPackages: Package[] = response.selectedPackages;
		const bumpType = getDefaultBumpTypeForBranch(branch) ?? "minor";

		const newFile = await createChangesetFile(
			context.gitRepo.resolvedRoot,
			new Map(selectedPackages.map((p) => [p, bumpType])),
			`${response.summary.trim()}\n\n${response.description}`,
		);
		const changesetPath = path.relative(context.gitRepo.resolvedRoot, newFile);
		this.logHr();
		this.log(`Created new changeset: ${chalk.green(changesetPath)}`);
		return {
			branch,
			selectedPackages: selectedPackages.map((p) => p.name),
			changesetPath,
		};
	}
}

async function createChangesetFile(
	rootPath: string,
	packages: Map<Package, VersionBumpType>,
	body?: string,
): Promise<string> {
	const changesetID = humanId({ separator: "-", capitalize: false });
	const changesetPath = path.join(rootPath, ".changeset", `${changesetID}.md`);
	const changesetContent = await createChangesetContent(packages, body);
	await writeFile(
		changesetPath,
		prettier(changesetContent, { proseWrap: "never", parser: "markdown" }),
	);
	return changesetPath;
}

async function createChangesetContent(
	packages: Map<Package, VersionBumpType>,
	body?: string,
): Promise<string> {
	const lines: string[] = ["---"];
	for (const [pkg, bump] of packages.entries()) {
		lines.push(`"${pkg.name}": ${bump}`);
	}
	lines.push("---", "\n");
	const frontMatter = lines.join("\n");
	const changesetContents = [frontMatter, body].join("\n");
	return changesetContents;
}

function isIncludedByDefault(pkg: Package): boolean {
	if (pkg.packageJson.private === true || excludedScopes.has(pkg.scope)) {
		return false;
	}

	return true;
}
