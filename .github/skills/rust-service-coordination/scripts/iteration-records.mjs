#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = process.env.RUST_SERVICE_RECORDS_REPOSITORY_ROOT
	? resolve(process.env.RUST_SERVICE_RECORDS_REPOSITORY_ROOT)
	: resolve(scriptDirectory, "../../../..");
if (process.env.RUST_SERVICE_RECORDS_REPOSITORY_ROOT) {
	console.error(`info: using repository root override: ${repositoryRoot}`);
}
const projectRoot = resolve(repositoryRoot, "rust-service");
const historicalRoot = resolve(projectRoot, "historical");
const iterationsRoot = resolve(historicalRoot, "iterations");
const assetsRoot = resolve(scriptDirectory, "../assets");
const qualityAssetsRoot = resolve(
	scriptDirectory,
	"../../rust-service-quality-iteration/assets",
);
const requiredMarker = "<!-- TODO(required):";

const templates = {
	foundation: "foundation-report.template.md",
	charter: "iteration-charter.template.md",
	instructions: "workstream-instructions.template.md",
	report: "workstream-report.template.md",
	integration: "integration-report.template.md",
	phase3: "phase-3-report.template.md",
	retrospective: "retrospective.template.md",
	skillReview: "skill-review.template.md",
	nextInstructions: "next-workstream-instructions.template.md",
};

function fail(message) {
	console.error(`error: ${message}`);
	process.exitCode = 1;
}

function requireIteration(value) {
	if (!/^\d{4}$/.test(value ?? "")) {
		throw new Error("iteration must be four digits, for example 0001");
	}
	return value;
}

function requireWorkstream(value) {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
		throw new Error(`invalid workstream name: ${value}`);
	}
	return value;
}

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function renderTemplate(templateName, replacements) {
	let content = await readFile(resolve(assetsRoot, templateName), "utf8");
	for (const [key, value] of Object.entries(replacements)) {
		content = content.replaceAll(`{{${key}}}`, value);
	}
	return content;
}

async function writeNew(path, content) {
	if (await exists(path)) {
		throw new Error(`refusing to overwrite ${relative(repositoryRoot, path)}`);
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf8");
}

async function init(iteration, workstreamArguments) {
	const workstreams = [...new Set(workstreamArguments.map(requireWorkstream))];
	if (workstreams.length === 0) {
		throw new Error("init requires at least one workstream name");
	}
	if (workstreams.length !== workstreamArguments.length) {
		throw new Error("workstream names must be unique");
	}

	const iterationRoot = resolve(iterationsRoot, iteration);
	if (await exists(resolve(iterationRoot, "manifest.json"))) {
		throw new Error(`iteration ${iteration} already exists`);
	}

	const nextIteration = String(Number(iteration) + 1).padStart(4, "0");
	const replacements = { ITERATION: iteration, NEXT_ITERATION: nextIteration };
	const manifest = {
		schemaVersion: 1,
		iteration,
		status: "planned",
		sourceCommit: "TODO",
		createdAt: new Date().toISOString(),
		activeWorkstreams: workstreams.map((name) => ({
			name,
			instructions: `phase-2/instructions/${name}.md`,
			report: `phase-2/${name}.md`,
		})),
		deferredWorkstreams: [],
		nextWorkstreams: [],
	};

	await mkdir(resolve(iterationRoot, "phase-2/instructions"), { recursive: true });
	await mkdir(resolve(iterationRoot, "next-phase-2-instructions"), { recursive: true });
	await writeNew(
		resolve(iterationRoot, "manifest.json"),
		`${JSON.stringify(manifest, undefined, "\t")}\n`,
	);
	await writeNew(
		resolve(iterationRoot, "charter.md"),
		await renderTemplate(templates.charter, replacements),
	);
	await writeNew(
		resolve(iterationRoot, "phase-2/integration.md"),
		await renderTemplate(templates.integration, replacements),
	);
	await writeNew(
		resolve(iterationRoot, "phase-3-report.md"),
		await renderTemplate(templates.phase3, replacements),
	);
	await writeNew(
		resolve(iterationRoot, "retrospective.md"),
		await renderTemplate(templates.retrospective, replacements),
	);
	await writeNew(
		resolve(iterationRoot, "skill-review.md"),
		await renderTemplate(templates.skillReview, replacements),
	);

	for (const workstream of workstreams) {
		const workstreamReplacements = { ...replacements, WORKSTREAM: workstream };
		await writeNew(
			resolve(iterationRoot, `phase-2/instructions/${workstream}.md`),
			await renderTemplate(templates.instructions, workstreamReplacements),
		);
		await writeNew(
			resolve(iterationRoot, `phase-2/${workstream}.md`),
			await renderTemplate(templates.report, workstreamReplacements),
		);
	}

	console.log(`Created iteration ${iteration} with ${workstreams.length} workstream(s).`);
}

async function createNextInstructions(iteration, workstreamArguments) {
	const workstreams = [...new Set(workstreamArguments.map(requireWorkstream))];
	if (workstreams.length === 0) {
		throw new Error("next requires at least one workstream name");
	}
	if (workstreams.length !== workstreamArguments.length) {
		throw new Error("workstream names must be unique");
	}

	const iterationRoot = resolve(iterationsRoot, iteration);
	const manifestPath = resolve(iterationRoot, "manifest.json");
	const manifest = await loadManifest(iterationRoot, iteration);
	if (manifest.nextWorkstreams.length > 0) {
		throw new Error(`iteration ${iteration} already has nextWorkstreams`);
	}

	const nextIteration = String(Number(iteration) + 1).padStart(4, "0");
	for (const workstream of workstreams) {
		await writeNew(
			resolve(iterationRoot, `next-phase-2-instructions/${workstream}.md`),
			await renderTemplate(templates.nextInstructions, {
				ITERATION: iteration,
				NEXT_ITERATION: nextIteration,
				WORKSTREAM: workstream,
			}),
		);
	}

	manifest.nextWorkstreams = workstreams;
	await writeFile(manifestPath, `${JSON.stringify(manifest, undefined, "\t")}\n`, "utf8");
	console.log(`Created ${workstreams.length} next-iteration instruction file(s).`);
}

async function initQualityInventory(iteration) {
	const path = resolve(iterationsRoot, iteration, "quality-inventory.md");
	if (await exists(path)) {
		throw new Error(`refusing to overwrite ${relative(repositoryRoot, path)}`);
	}
	const template = await readFile(
		resolve(qualityAssetsRoot, "quality-inventory.template.md"),
		"utf8",
	);
	await writeNew(path, template.replaceAll("{{ITERATION}}", iteration));
	console.log(`Created quality inventory for iteration ${iteration}.`);
}

async function validateQualityInventory(iteration, errors = []) {
	const path = resolve(iterationsRoot, iteration, "quality-inventory.md");
	await validateMarkdown(
		path,
		[
			"Selection Rationale",
			"Reviewed Boundaries",
			"Deferred Candidates",
			"Coverage Layer Review",
			"Convergence Assessment",
		],
		errors,
	);
	if (!(await exists(path))) {
		return errors;
	}
	const content = await readFile(path, "utf8");
	if (!content.includes(`Iteration ${iteration} Rust Quality Inventory`)) {
		errors.push("quality inventory title does not match the iteration");
	}
	if (!/^Status: (complete|in progress)$/m.test(content)) {
		errors.push("quality inventory status must be 'in progress' or 'complete'");
	}
	const tableRows = content
		.split("\n")
		.filter((line) => line.startsWith("|") && !line.includes("---"));
	if (tableRows.length < 2) {
		errors.push("quality inventory reviewed-boundaries table has no data row");
	}
	return errors;
}

async function loadManifest(iterationRoot, expectedIteration) {
	const manifestPath = resolve(iterationRoot, "manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (manifest.schemaVersion !== 1) {
		throw new Error("manifest schemaVersion must be 1");
	}
	if (manifest.iteration !== expectedIteration) {
		throw new Error(`manifest iteration must be ${expectedIteration}`);
	}
	if (!Array.isArray(manifest.activeWorkstreams) || manifest.activeWorkstreams.length === 0) {
		throw new Error("manifest must contain activeWorkstreams");
	}
	return manifest;
}

async function validateMarkdown(path, headings, errors) {
	if (!(await exists(path))) {
		errors.push(`missing ${relative(repositoryRoot, path)}`);
		return;
	}
	const content = await readFile(path, "utf8");
	const topLevelHeadings = content.match(/^# .+$/gm) ?? [];
	if (topLevelHeadings.length !== 1) {
		errors.push(
			`${relative(repositoryRoot, path)} must contain exactly one top-level heading`,
		);
	}
	for (const heading of headings) {
		if (!content.includes(`## ${heading}`)) {
			errors.push(`${relative(repositoryRoot, path)} is missing heading: ${heading}`);
		}
	}
	if (content.includes(requiredMarker)) {
		errors.push(`${relative(repositoryRoot, path)} contains unresolved required markers`);
	}

	for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
		const target = match[1].split("#", 1)[0];
		if (target.includes("decisions/") && !(await exists(resolve(dirname(path), target)))) {
			errors.push(`${relative(repositoryRoot, path)} has missing decision link: ${target}`);
		}
	}
}

async function validateFoundation() {
	const errors = [];
	const reportPath = resolve(historicalRoot, "foundation-report.md");
	await validateMarkdown(
		reportPath,
		[
			"Purpose and Scope",
			"Initial Hypotheses and Checks",
			"Settled Preparation Decisions",
			"Open Semantic Decisions",
			"Notable Events",
			"Deliverables and Dependency Graph",
			"Validation Evidence",
			"Decisions and Human Interventions",
			"Agentic Development Findings",
			"Phase 1 Readiness Assessment",
		],
		errors,
	);

	if (await exists(reportPath)) {
		const report = await readFile(reportPath, "utf8");
		if (!/^Status: complete$/m.test(report)) {
			errors.push("foundation-report.md status must be complete");
		}
	}

	for (const requiredPath of [
		"Cargo.toml",
		"Cargo.lock",
		"DEVELOPMENT.md",
		"rust-toolchain.toml",
	]) {
		if (!(await exists(resolve(projectRoot, requiredPath)))) {
			errors.push(`missing rust-service/${requiredPath}`);
		}
	}

	if (await exists(resolve(projectRoot, "DEVELOPMENT.md"))) {
		const development = await readFile(resolve(projectRoot, "DEVELOPMENT.md"), "utf8");
		for (const command of [
			"cargo fmt --all -- --check",
			"cargo clippy --workspace --all-targets --all-features -- -D warnings",
			"cargo build --workspace --all-targets",
			"cargo test --workspace --all-targets --all-features",
			"node scripts/check-documentation.mjs",
		]) {
			if (!development.includes(command)) {
				errors.push(`DEVELOPMENT.md does not document: ${command}`);
			}
		}
	}

	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`error: ${error}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log("Foundation passes artifact validation.");
}

async function validate(iteration, phase) {
	if (phase !== "start" && phase !== "phase-2" && phase !== "complete") {
		throw new Error("validation phase must be start, phase-2, or complete");
	}

	const iterationRoot = resolve(iterationsRoot, iteration);
	const errors = [];
	let manifest;
	try {
		manifest = await loadManifest(iterationRoot, iteration);
	} catch (error) {
		fail(error.message);
		return;
	}

	const expectedStatus =
		phase === "start"
			? ["active"]
			: phase === "phase-2"
				? ["phase-2-complete", "complete"]
				: ["complete"];
	if (!expectedStatus.includes(manifest.status)) {
		errors.push(`manifest status must be ${expectedStatus.join(" or ")}`);
	}
	if (!manifest.sourceCommit || manifest.sourceCommit === "TODO") {
		errors.push("manifest sourceCommit must be recorded");
	}

	const names = manifest.activeWorkstreams.map((entry) => entry.name);
	if (new Set(names).size !== names.length) {
		errors.push("active workstream names must be unique");
	}

	await validateMarkdown(
		resolve(iterationRoot, "charter.md"),
		[
			"Questions and Hypotheses",
			"Active Workstreams",
			"Deferred Scope",
			"Shared Validation",
			"Risks and Escalation",
		],
		errors,
	);
	for (const entry of manifest.activeWorkstreams) {
		if (!entry.name || !entry.instructions || !entry.report) {
			errors.push("each active workstream needs name, instructions, and report fields");
			continue;
		}
		await validateMarkdown(
			resolve(iterationRoot, entry.instructions),
			[
				"Assignment",
				"Ownership",
				"Expected Evidence",
				"Validation",
				"Escalation and Stopping Conditions",
				"Reporting Requirements",
			],
			errors,
		);
		if (phase !== "start") {
			await validateMarkdown(
				resolve(iterationRoot, entry.report),
				[
					"Outcome",
					"Hypothesis Results",
					"Deliverables and Commits",
					"Validation Evidence",
					"Notable Events",
					"Contract and Integration Friction",
					"Human Interventions",
					"Measurements",
					"Proposed Decisions",
					"Candidate Skills and Process Changes",
					"Remaining Work and Risks",
				],
				errors,
			);
		}
	}

	if (phase !== "start") {
		await validateMarkdown(
			resolve(iterationRoot, "phase-2/integration.md"),
			[
				"Accepted Work",
				"Rejected or Deferred Work",
				"Conflict Resolution and Adaptation",
				"Validation Evidence",
				"Cross-Workstream Findings",
				"Artifact Check",
			],
			errors,
		);
	}

	const reportDirectory = resolve(iterationRoot, "phase-2");
	if (await exists(reportDirectory)) {
		const actualReports = (await readdir(reportDirectory))
			.filter((name) => name.endsWith(".md") && name !== "integration.md")
			.sort();
		const expectedReports = manifest.activeWorkstreams
			.map((entry) => entry.report.split("/").at(-1))
			.sort();
		if (JSON.stringify(actualReports) !== JSON.stringify(expectedReports)) {
			errors.push("Phase 2 report files do not match manifest activeWorkstreams");
		}
	}

	if (phase === "complete") {
		await validateMarkdown(
			resolve(iterationRoot, "phase-3-report.md"),
			[
				"Evidence Summary",
				"Implementation Defects",
				"Shared Abstraction Findings",
				"Decisions",
				"Comparative Results",
				"Learning and Process Findings",
				"Skill Changes",
				"Next Iteration Scope",
				"Convergence Assessment",
			],
			errors,
		);
		await validateMarkdown(
			resolve(iterationRoot, "retrospective.md"),
			[
				"What We Expected",
				"What We Observed",
				"Costly Issues and Dead Ends",
				"Agentic Development Findings",
				"Practices to Keep, Change, or Stop",
				"Durable Lessons",
				"Open Questions",
			],
			errors,
		);
		await validateMarkdown(
			resolve(iterationRoot, "skill-review.md"),
			[
				"Evidence Reviewed",
				"Candidate Skills or Changes",
				"Decisions",
				"Applied Changes",
				"Next Review Triggers",
			],
			errors,
		);

		if (!Array.isArray(manifest.nextWorkstreams)) {
			errors.push("manifest nextWorkstreams must be an array");
		} else {
			for (const name of manifest.nextWorkstreams) {
				try {
					requireWorkstream(name);
				} catch (error) {
					errors.push(error.message);
					continue;
				}
				await validateMarkdown(
					resolve(iterationRoot, `next-phase-2-instructions/${name}.md`),
					[
						"Approved Scope",
						"Prior Evidence",
						"Hypothesis and Discriminating Check",
						"Ownership and Dependencies",
						"Deliverables and Validation",
					],
					errors,
				);
			}
		}

		if (await exists(resolve(iterationRoot, "quality-inventory.md"))) {
			await validateQualityInventory(iteration, errors);
		}
	}

	if (!(await exists(resolve(historicalRoot, "LEARNINGS.md")))) {
		errors.push("missing rust-service/historical/LEARNINGS.md");
	}
	if (!(await exists(resolve(historicalRoot, "decisions/README.md")))) {
		errors.push("missing rust-service/historical/decisions/README.md");
	} else if (phase === "complete") {
		const decisionFiles = (await readdir(resolve(historicalRoot, "decisions"))).filter(
			(name) => name.endsWith(".md") && name !== "README.md",
		);
		for (const decisionFile of decisionFiles) {
			await validateMarkdown(
				resolve(historicalRoot, "decisions", decisionFile),
				[
					"Context",
					"Decision Drivers",
					"Options and Evidence",
					"Decision",
					"Consequences",
					"Validation and Follow-Up",
				],
				errors,
			);
		}
	}

	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`error: ${error}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log(`Iteration ${iteration} passes ${phase} artifact validation.`);
}

function usage() {
	console.log(`Usage:
  iteration-records.mjs validate-foundation
  iteration-records.mjs init NNNN workstream-name...
	iteration-records.mjs init-quality NNNN
	iteration-records.mjs next NNNN workstream-name...
	iteration-records.mjs validate-quality NNNN
	iteration-records.mjs validate NNNN start|phase-2|complete`);
}

try {
	const [command, iterationArgument, ...rest] = process.argv.slice(2);
	if (command === "validate-foundation") {
		await validateFoundation();
	} else if (!command || !iterationArgument) {
		usage();
		process.exitCode = 1;
	} else {
		const iteration = requireIteration(iterationArgument);
		if (command === "init") {
			await init(iteration, rest);
		} else if (command === "init-quality") {
			await initQualityInventory(iteration);
		} else if (command === "next") {
			await createNextInstructions(iteration, rest);
		} else if (command === "validate-quality") {
			const errors = await validateQualityInventory(iteration);
			if (errors.length > 0) {
				for (const error of errors) {
					console.error(`error: ${error}`);
				}
				process.exitCode = 1;
			} else {
				console.log(`Quality inventory ${iteration} passes validation.`);
			}
		} else if (command === "validate") {
			await validate(iteration, rest[0]);
		} else {
			throw new Error(`unknown command: ${command}`);
		}
	}
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
