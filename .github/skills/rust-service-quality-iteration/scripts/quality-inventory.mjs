#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = process.env.RUST_SERVICE_QUALITY_REPOSITORY_ROOT
	? resolve(process.env.RUST_SERVICE_QUALITY_REPOSITORY_ROOT)
	: resolve(scriptDirectory, "../../../..");
const templatePath = resolve(scriptDirectory, "../assets/quality-inventory.template.md");
const requiredMarker = "<!-- TODO(required):";

function requireIteration(value) {
	if (!/^\d{4}$/.test(value ?? "")) {
		throw new Error("iteration must be four digits, for example 0014");
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

function inventoryPath(iteration) {
	return resolve(
		repositoryRoot,
		"rust-service",
		"iterations",
		iteration,
		"quality-inventory.md",
	);
}

async function init(iteration) {
	const path = inventoryPath(iteration);
	if (await exists(path)) {
		throw new Error(`refusing to overwrite ${path}`);
	}
	const template = await readFile(templatePath, "utf8");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, template.replaceAll("{{ITERATION}}", iteration), "utf8");
	console.log(`Created quality inventory for iteration ${iteration}.`);
}

async function validate(iteration) {
	const path = inventoryPath(iteration);
	const content = await readFile(path, "utf8");
	const requiredHeadings = [
		"## Selection Rationale",
		"## Reviewed Boundaries",
		"## Deferred Candidates",
		"## Coverage Layer Review",
		"## Convergence Assessment",
	];
	const errors = [];

	if (content.includes(requiredMarker)) {
		errors.push("required TODO markers remain");
	}
	for (const heading of requiredHeadings) {
		if (!content.includes(heading)) {
			errors.push(`missing heading: ${heading}`);
		}
	}
	if (!content.includes(`Iteration ${iteration} Rust Quality Inventory`)) {
		errors.push("title does not match the requested iteration");
	}
	if (!/^Status: (complete|in progress)$/m.test(content)) {
		errors.push("status must be 'in progress' or 'complete'");
	}
	const tableRows = content
		.split("\n")
		.filter((line) => line.startsWith("|") && !line.includes("---"));
	if (tableRows.length < 2) {
		errors.push("reviewed-boundaries table has no data row");
	}

	if (errors.length > 0) {
		for (const error of errors) {
			console.error(`error: ${error}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log(`Quality inventory ${iteration} passes validation.`);
}

const [command, iterationArgument, ...extraArguments] = process.argv.slice(2);
if (extraArguments.length > 0 || !["init", "validate"].includes(command)) {
	throw new Error("usage: quality-inventory.mjs <init|validate> NNNN");
}
const iteration = requireIteration(iterationArgument);

if (command === "init") {
	await init(iteration);
} else {
	await validate(iteration);
}
