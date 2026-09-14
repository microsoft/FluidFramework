#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rustServiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultRoots = [
	"crates/benchmarks",
	"crates/spikes/durable-log",
	"examples/counter",
	"examples/native-service",
	"benchmarks",
	"scripts",
];
const requestedRoots = process.argv.slice(2);
const roots = requestedRoots.length === 0 ? defaultRoots : requestedRoots;
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];
let checkedLinks = 0;
let checkedReadmes = 0;

function resolveWithinRustService(candidate) {
	const resolved = path.resolve(rustServiceRoot, candidate);
	const relative = path.relative(rustServiceRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`path escapes rust-service: ${candidate}`);
	}
	return resolved;
}

function readmesUnder(directory) {
	const readmes = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			readmes.push(...readmesUnder(entryPath));
		} else if (entry.isFile() && entry.name.toLowerCase() === "readme.md") {
			readmes.push(entryPath);
		}
	}
	return readmes;
}

function checkLinks(readme) {
	checkedReadmes += 1;
	const contents = fs.readFileSync(readme, "utf8");
	for (const match of contents.matchAll(markdownLink)) {
		const destination = match[1].trim();
		if (
			destination === "" ||
			destination.startsWith("#") ||
			/^[a-z][a-z0-9+.-]*:/i.test(destination)
		) {
			continue;
		}
		const withoutTitle = destination.replace(/\s+["'][^"']*["']$/, "");
		const decodedPath = decodeURIComponent(withoutTitle.split("#", 1)[0]);
		const target = path.resolve(path.dirname(readme), decodedPath);
		const relativeTarget = path.relative(rustServiceRoot, target);
		checkedLinks += 1;
		if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
			failures.push(
				`${path.relative(rustServiceRoot, readme)}: link escapes rust-service: ${destination}`,
			);
		} else if (!fs.existsSync(target)) {
			failures.push(
				`${path.relative(rustServiceRoot, readme)}: missing link target: ${destination}`,
			);
		}
	}
}

function checkRoot(root) {
	const absoluteRoot = resolveWithinRustService(root);
	const readme = path.join(absoluteRoot, "README.md");
	if (!fs.statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) {
		failures.push(`${root}: root is not a directory`);
		return;
	}
	if (!fs.statSync(readme, { throwIfNoEntry: false })?.isFile()) {
		failures.push(`${root}: README.md is missing`);
		return;
	}

	for (const nestedReadme of readmesUnder(absoluteRoot)) {
		checkLinks(nestedReadme);
	}
}

for (const root of roots) {
	try {
		checkRoot(root);
	} catch (error) {
		failures.push(`${root}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`documentation check failed: ${failure}`);
	}
	process.exitCode = 1;
} else {
	console.log(
		`documentation check passed: ${roots.length} roots, ${checkedReadmes} READMEs, ${checkedLinks} local links`,
	);
}
