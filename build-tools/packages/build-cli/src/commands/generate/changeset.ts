/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { Package } from "@fluidframework/build-tools";
import { Flags, ux } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import { humanId } from "human-id";
import chalk from "picocolors";
import prompts from "prompts";

import { releaseGroupFlag } from "../../flags.js";
import {
	BaseCommand,
	type FluidCustomChangesetMetadata,
	getDefaultBumpTypeForBranch,
} from "../../library/index.js";

/**
 * If more than this number of packages are changed relative to the selected branch, the user will be prompted to select
 * the target branch.
 */
const BRANCH_PROMPT_LIMIT = 10;
const DEFAULT_BRANCH = "main";
const INSTRUCTIONS = `
↑/↓: Change selection
Space: Toggle selection
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
	value?: Package | string;
	disabled?: boolean;
	selected?: boolean;
	heading?: boolean;
}

export default class GenerateChangesetCommand extends BaseCommand<
	typeof GenerateChangesetCommand
> {
	static readonly summary =
		`Generates a new changeset file. You will be prompted to select the packages affected by this change. You can also create an empty changeset to include with this change that can be updated later.`;

	static readonly aliases: string[] = [
		// 'add' is the verb that the standard changesets cli uses. It's also shorter than 'generate'.
		"changeset:add",
	];

	// Enables the global JSON flag in oclif.
	static readonly enableJsonFlag = true;

	static readonly flags = {
		releaseGroup: releaseGroupFlag({ default: "client" }),
		branch: Flags.string({
			char: "b",
			description: `The branch to compare the current changes against. The current changes will be compared with this branch to populate the list of changed packages. ${chalk.bold(
				"You must have a valid remote pointing to the microsoft/FluidFramework repo.",
			)}`,
			default: DEFAULT_BRANCH,
		}),
		empty: Flags.boolean({
			description: `Create an empty changeset file. If this flag is used, all other flags are ignored. A new, randomly named changeset file will be created every time --empty is used.`,
			dependsOn: ["releaseGroup"],
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
	} as const;

	static readonly examples = [
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
		const { all, empty, releaseGroup, uiMode } = this.flags;
		let { branch } = this.flags;

		const monorepo =
			releaseGroup === undefined ? undefined : context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			this.error(`Release group ${releaseGroup} not found in repo config`, { exit: 1 });
		}

		if (empty) {
			const emptyFile = await createChangesetFile(
				monorepo.directory ?? context.root,
				new Map(),
			);
			// eslint-disable-next-line @typescript-eslint/no-shadow
			const changesetPath = path.relative(context.root, emptyFile);
			this.logHr();
			this.log(`Created empty changeset: ${chalk.green(changesetPath)}`);
			return {
				branch,
				selectedPackages: [],
				changesetPath,
			};
		}

		const repo = await context.getGitRepository();
		const remote = await repo.getRemote(repo.upstreamRemotePartialUrl);

		if (remote === undefined) {
			this.error(`Can't find a remote with ${repo.upstreamRemotePartialUrl}`, {
				exit: 1,
			});
		}
		this.log(`Remote for ${repo.upstreamRemotePartialUrl} is: ${chalk.bold(remote)}`);

		ux.action.start(`Comparing local changes to remote for branch ${branch}`);
		let {
			packages: initialBranchChangedPackages,
			files: changedFiles,
			releaseGroups: changedReleaseGroups,
		} = await repo.getChangedSinceRef(branch, remote, context);
		ux.action.stop();

		// Separate definition to address no-atomic-updates lint rule
		// https://eslint.org/docs/latest/rules/require-atomic-updates
		let changedPackages = initialBranchChangedPackages;

		// If the branch flag was passed explicitly, we don't want to prompt the user to select one. We can't check for
		// undefined because there's a default value for the flag.
		const usedBranchFlag = this.argv.includes("--branch") || this.argv.includes("-b");
		if (!usedBranchFlag && initialBranchChangedPackages.length > BRANCH_PROMPT_LIMIT) {
			const answer = await prompts({
				type: "select",
				name: "selectedBranch",
				message: `More than ${BRANCH_PROMPT_LIMIT} packages were edited compared to the ${branch} branch. Maybe you meant to select a different target branch?`,
				choices: [
					{ title: "next", value: "next" },
					{ title: "main", value: "main" },
					{ title: "lts", value: "lts" },
				],
				initial: branch === "next" ? 0 : branch === "main" ? 1 : 2,
			});

			// Note if the selected branch matched the original one so we can optimize
			const sameBranch = branch === answer.selectedBranch;
			branch = answer.selectedBranch as string;

			if (!sameBranch) {
				ux.action.start(
					`Branch changed. Comparing local changes to remote for branch ${branch}`,
				);
				const newChanges = await repo.getChangedSinceRef(branch, remote, context);
				ux.action.stop();

				changedPackages = newChanges.packages;
				changedReleaseGroups = newChanges.releaseGroups;
				changedFiles = newChanges.files;
			}
		}

		this.verbose(`release groups: ${changedReleaseGroups.join(", ")}`);
		this.verbose(`packages: ${changedPackages.map((p) => p.name).join(", ")}`);
		this.verbose(`files: ${changedFiles.join(", ")}`);

		changedPackages = changedPackages.filter((pkg) => {
			const inReleaseGroup = pkg.monoRepo?.name === releaseGroup;
			if (!inReleaseGroup) {
				this.warning(
					`${pkg.name}: Ignoring changed package because it is not in the ${releaseGroup} release group.`,
				);
			}
			return inReleaseGroup;
		});

		let noChanges: boolean = false;
		if (changedFiles.length === 0) {
			this.warning(`No changes when compared to ${branch}.`);
			noChanges = true;
		} else if (changedPackages.length === 0) {
			this.warning(`No changed packages when compared to ${branch}.`);
			noChanges = true;
		}

		if (changedReleaseGroups.length > 1 && releaseGroup === undefined) {
			this.error(
				`More than one release group changed when compared to ${branch} (${changedReleaseGroups.join(
					", ",
				)}). You must specify which release group you're creating a changeset for using the --releaseGroup flag.`,
				{ exit: 1 },
			);
		}

		const packageChoices: Choice[] = [];

		// Handle the selected release group first so it shows up in the list first.
		packageChoices.push(
			{ title: `${chalk.bold(monorepo.name)}`, heading: true, disabled: true },
			...monorepo.packages
				.filter((pkg) => all || noChanges || isIncludedByDefault(pkg))
				.sort((a, b) => packageComparer(a, b, changedPackages))
				.map((pkg) => {
					const changed = changedPackages.some((cp) => cp.name === pkg.name);
					return {
						title: changed ? `${pkg.name} ${chalk.red(chalk.bold("(changed)"))}` : pkg.name,
						value: pkg,
						selected: changed,
					};
				}),
			// Next list independent packages in a group
			{ title: chalk.bold("Independent Packages"), heading: true, disabled: true },
		);

		for (const pkg of context.independentPackages) {
			if (!all && !isIncludedByDefault(pkg)) {
				continue;
			}
			const changed = changedPackages.some((cp) => cp.name === pkg.name);
			packageChoices.push({
				title: changed ? `${pkg.name} ${chalk.red(chalk.bold("(changed)"))}` : pkg.name,
				value: pkg,
				selected: changed,
			});
		}

		// Finally list the remaining (unchanged) release groups and their packages
		for (const rg of context.repo.releaseGroups.values()) {
			if (rg.name !== releaseGroup) {
				packageChoices.push(
					{ title: `${chalk.bold(rg.kind)}`, heading: true, disabled: true },
					...rg.packages
						.filter((pkg) => (all ? true : isIncludedByDefault(pkg)))
						.sort((a, b) => packageComparer(a, b, changedPackages))
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

		const sectionChoices: Choice[] =
			context.flubConfig.releaseNotes?.sections === undefined
				? []
				: Object.entries(context.flubConfig.releaseNotes.sections).map(
						([name, { heading }]) => {
							const choice: Choice = {
								title: heading,
								value: name,
							};
							return choice;
						},
					);

		/**
		 * The prompts typing for the `onState` function doesn't include the shape of the `state` object, so this interface
		 * serves as that type. Based on the documentation at: https://www.npmjs.com/package/prompts#onstate
		 */
		interface PromptState {
			/**
			 * The documentation isn't clear about what the type of `value` is. It is likely a string, but since we don't use
			 * it in this code, `unknown` is safer.
			 */
			value: unknown;

			/**
			 * This is set to true when the prompt has been aborted.
			 */
			aborted: boolean;
		}

		const questions: (prompts.PromptObject & { optionsPerPage?: number })[] = [
			{
				// Ask this question only if there are no changes.
				// falsy values for "type" will cause the question to be skipped.
				type: noChanges ? "confirm" : false,
				name: "releaseNotesOnly",
				message:
					"No changed packages have been detected. Do you want to create a changeset associated with no packages?",
				initial: true,
				onState: (state: PromptState): void => {
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
			{
				name: "selectedPackages",
				// If the previous answer was yes, skip this question.
				// falsy values for "type" will cause the question to be skipped.
				type: (prev: boolean) =>
					prev === true
						? false
						: uiMode === "default"
							? "autocompleteMultiselect"
							: "multiselect",
				choices: [...packageChoices, { title: " ", heading: true, disabled: true }],
				instructions: INSTRUCTIONS,
				message: "Choose which packages to include in the changeset. Type to filter the list.",
				optionsPerPage: 5,
				onState: (state: PromptState): void => {
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
			{
				name: "section",
				// This question should only be asked if the releaseNotes config is available.
				// falsy values for "type" will cause the question to be skipped.
				type: context.flubConfig.releaseNotes === undefined ? false : "select",
				choices: sectionChoices,
				instructions: INSTRUCTIONS,
				message: "What section of the release notes should this change be in?",
				onState: (state: PromptState): void => {
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
			{
				name: "summary",
				type: "text",
				message: "Enter a single sentence summary of the change.",
				onState: (state: PromptState): void => {
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
			{
				name: "description",
				type: "text",
				message:
					"Enter a longer description of the change. If you have a lot to type, consider adding it to the changeset after it's created.",
				onState: (state: PromptState): void => {
					if (state.aborted) {
						process.nextTick(() => this.exit(0));
					}
				},
			},
		];

		const response = await prompts(questions);
		// The response.selectedPackages value will be undefined if the question was skipped, so default to an empty array
		// in that case.
		const selectedPackages: Package[] = (response.selectedPackages ?? []) as Package[];
		const bumpType = getDefaultBumpTypeForBranch(branch, releaseGroup) ?? "minor";

		const newFile = await createChangesetFile(
			monorepo.directory ?? context.root,
			new Map(selectedPackages.map((p) => [p, bumpType])),
			`${(response.summary as string).trim()}\n\n${response.description}`,
			{ section: response.section as string },
		);
		const changesetPath = path.relative(context.root, newFile);

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
	additionalMetadata?: FluidCustomChangesetMetadata,
): Promise<string> {
	const changesetID = humanId({ separator: "-", capitalize: false });
	const changesetPath = path.join(rootPath, ".changeset", `${changesetID}.md`);
	const changesetContent = createChangesetContent(packages, body, additionalMetadata);
	await writeFile(changesetPath, changesetContent);
	return changesetPath;
}

function createChangesetContent(
	packages: Map<Package, VersionBumpType>,
	body?: string,
	additionalMetadata?: FluidCustomChangesetMetadata,
): string {
	const frontMatterSeparator = "---";

	const lines: string[] = [frontMatterSeparator];
	for (const [pkg, bump] of packages.entries()) {
		lines.push(`"${pkg.name}": ${bump}`);
	}
	lines.push(frontMatterSeparator);

	if (additionalMetadata !== undefined) {
		lines.push(frontMatterSeparator);
		for (const [name, value] of Object.entries(additionalMetadata)) {
			lines.push(`"${name}": ${value}`);
		}
		lines.push(
			frontMatterSeparator,
			// an extra empty line after the front matter
			"",
		);
	}

	const frontMatter = lines.join("\n");
	const changesetContents = [frontMatter, body].join("\n");
	return changesetContents;
}

function isIncludedByDefault(pkg: Package): boolean {
	if (pkg.packageJson.private === true || excludedScopes.has(PackageName.getScope(pkg.name))) {
		return false;
	}

	return true;
}

/**
 * Compares two packages for sorting purposes. Packages that have changed are sorted first.
 *
 * @param a - The first package to compare.
 * @param b - The second package to compare.
 * @param changedPackages - An array of changed packages.
 */
function packageComparer(a: Package, b: Package, changedPackages: Package[]): number {
	const aChanged = changedPackages.some((cp) => cp.name === a.name);
	const bChanged = changedPackages.some((cp) => cp.name === b.name);

	// If a has changed but b hasn't, then a should be sorted earlier.
	if (aChanged && !bChanged) {
		return -1;
	}

	// If a hasn't changed but b has, then b should be sorted earlier.
	if (!aChanged && bChanged) {
		return 1;
	}

	// Otherwise, compare by name.
	return PackageName.getUnscopedName(a.name) < PackageName.getUnscopedName(b.name)
		? -1
		: a.name === b.name
			? 0
			: 1;
}
