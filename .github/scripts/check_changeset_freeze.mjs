import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const changesetStateProperty = "__fluidChangesetState";

export class ChangesetFreezeError extends Error {}

function runGit(repoPath, args) {
	return execFileSync("git", args, {
		cwd: repoPath,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trimEnd();
}

function readFileAtRef(repoPath, ref, filePath) {
	return runGit(repoPath, ["show", `${ref}:${filePath}`]);
}

function loadChangesetStates(repoPath, baseRef) {
	const configPaths = runGit(repoPath, ["ls-tree", "-r", "--name-only", baseRef])
		.split("\n")
		.filter(
			(filePath) =>
				filePath === ".changeset/config.json" ||
				filePath.endsWith("/.changeset/config.json"),
		);

	return configPaths.flatMap((configPath) => {
		let config;
		try {
			config = JSON.parse(readFileAtRef(repoPath, baseRef, configPath));
		} catch (error) {
			throw new ChangesetFreezeError(
				`${configPath}: could not read valid JSON from ${baseRef}: ${error.message}`,
			);
		}

		const state = config[changesetStateProperty];
		if (state === undefined) {
			return [];
		}

		if (state === null || typeof state !== "object" || Array.isArray(state)) {
			throw new ChangesetFreezeError(
				`${configPath}: ${changesetStateProperty} must be an object.`,
			);
		}

		if (!Object.hasOwn(state, "currentVersion") || !Object.hasOwn(state, "lockedVersion")) {
			throw new ChangesetFreezeError(
				`${configPath}: ${changesetStateProperty} must define currentVersion and lockedVersion.`,
			);
		}

		if (typeof state.currentVersion !== "string") {
			throw new ChangesetFreezeError(
				`${configPath}: ${changesetStateProperty}.currentVersion must be a string.`,
			);
		}
		if (state.lockedVersion !== null && typeof state.lockedVersion !== "string") {
			throw new ChangesetFreezeError(
				`${configPath}: ${changesetStateProperty}.lockedVersion must be null or a string.`,
			);
		}

		const changesetDirectory = path.posix.dirname(configPath);
		return [
			{
				configPath,
				changesetDirectory,
				currentVersion: state.currentVersion,
				lockedVersion: state.lockedVersion,
				frozen:
					state.lockedVersion !== null && state.currentVersion === state.lockedVersion,
			},
		];
	});
}

function loadChangedPaths(repoPath, baseRef, headRef) {
	const output = runGit(repoPath, [
		"diff",
		"--name-status",
		"--find-renames",
		`${baseRef}...${headRef}`,
	]);

	if (output.length === 0) {
		return [];
	}

	return output.split("\n").map((line) => {
		const [status, ...paths] = line.split("\t");
		return { status, paths };
	});
}

function isChangesetMarkdown(filePath, changesetDirectory) {
	if (!filePath.startsWith(`${changesetDirectory}/`)) {
		return false;
	}

	const relativePath = filePath.slice(changesetDirectory.length + 1);
	return (
		!relativePath.includes("/") &&
		relativePath.endsWith(".md") &&
		relativePath.toLowerCase() !== "readme.md"
	);
}

export function checkChangesetFreeze({ repoPath = process.cwd(), baseRef, headRef }) {
	if (baseRef === undefined || headRef === undefined) {
		throw new ChangesetFreezeError("Both baseRef and headRef are required.");
	}

	const states = loadChangesetStates(repoPath, baseRef);
	const frozenStates = states.filter((state) => state.frozen);
	if (frozenStates.length === 0) {
		return { states, violations: [] };
	}

	const changedPaths = loadChangedPaths(repoPath, baseRef, headRef);
	const violations = frozenStates.flatMap((state) => {
		const files = [
			...new Set(
				changedPaths.flatMap(({ paths }) =>
					paths.filter((filePath) =>
						isChangesetMarkdown(filePath, state.changesetDirectory),
					),
				),
			),
		];

		return files.length === 0 ? [] : [{ ...state, files }];
	});

	if (violations.length > 0) {
		const details = violations
			.map(
				({ configPath, lockedVersion, files }) =>
					`${configPath} is frozen for ${lockedVersion}:\n${files
						.map((filePath) => `  - ${filePath}`)
						.join("\n")}`,
			)
			.join("\n\n");
		throw new ChangesetFreezeError(
			`Changesets cannot be modified while release notes are locked.\n\n${details}\n\nWait for the version-bump PR to update currentVersion before modifying these changesets.`,
		);
	}

	return { states, violations };
}

function parseArguments(args) {
	const parsed = { repoPath: process.cwd() };
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const value = args[index + 1];
		switch (argument) {
			case "--base":
				parsed.baseRef = value;
				index += 1;
				break;
			case "--head":
				parsed.headRef = value;
				index += 1;
				break;
			case "--repo":
				parsed.repoPath = value;
				index += 1;
				break;
			default:
				throw new ChangesetFreezeError(`Unknown argument: ${argument}`);
		}
	}
	return parsed;
}

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	try {
		const result = checkChangesetFreeze(parseArguments(process.argv.slice(2)));
		const protectedGroups = result.states.length;
		console.log(
			`Changeset freeze check passed for ${protectedGroups} configured release ${
				protectedGroups === 1 ? "unit" : "units"
			}.`,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
