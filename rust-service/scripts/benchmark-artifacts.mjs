/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repository = resolve(import.meta.dirname, "../..");
const executables = [
	"sea-benchmarks",
	"sea-webtransport-server",
	"presentation-native",
	"presentation-test-spans",
	"storage-pipeline",
];
const receiptPath = "rust-service/target/release/benchmark-build.json";
const rebuild =
	"Rebuild with CARGO_TARGET_DIR=<source-specific-target> bash rust-service/scripts/build-benchmark-artifacts.sh";

/** @param {string} file - File whose contents identify the artifact. */
function hashFile(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * Hashes native workspace inputs, including uncommitted files, but not documentation.
 * @param {string} root - Repository root.
 */
export function nativeSourceHash(root = repository) {
	const files = execFileSync(
		"git",
		[
			"ls-files",
			"--cached",
			"--others",
			"--exclude-standard",
			"-z",
			"--",
			"rust-service/crates",
			"rust-service/Cargo.toml",
			"rust-service/Cargo.lock",
			"rust-service/.cargo",
			"rust-service/rust-toolchain*",
			".cargo",
			"rust-toolchain*",
			"rust-service/scripts/build-benchmark-artifacts.sh",
			"rust-service/scripts/benchmark-common.sh",
			"rust-service/scripts/benchmark-artifacts.mjs",
		],
		{ cwd: root, encoding: "utf8" },
	)
		.split("\0")
		.filter((file) => file.length > 0 && !file.endsWith(".md"));
	const hash = createHash("sha256");
	for (const file of [...new Set(files)].sort()) {
		hash
			.update(file)
			.update("\0")
			.update(hashFile(resolve(root, file)))
			.update("\0");
	}
	return hash.digest("hex");
}

/**
 * Records a completed build only if its inputs did not change during compilation.
 * @param {string} before - Source hash captured before building.
 * @param {string} root - Repository root.
 */
export function recordNativeBuild(before, root = repository) {
	assert.equal(
		nativeSourceHash(root),
		before,
		`Native sources changed during build. ${rebuild}`,
	);
	const binaries = Object.fromEntries(
		executables.map((name) => [
			name,
			hashFile(resolve(root, "rust-service/target/release", name)),
		]),
	);
	writeFileSync(
		resolve(root, receiptPath),
		`${JSON.stringify({ source: before, binaries }, null, "\t")}\n`,
	);
}

/**
 * Fails before collection when selected executables are missing, stale, or replaced.
 * @param {string[]} names - Executables required by this workload.
 * @param {string} root - Repository root.
 */
export function verifyNativeBuild(names, root = repository) {
	if (names.length === 0) return;
	try {
		const receipt = JSON.parse(readFileSync(resolve(root, receiptPath), "utf8"));
		assert.equal(receipt.source, nativeSourceHash(root), "Native source fingerprint changed");
		for (const name of names) {
			assert.ok(executables.includes(name), `Unknown native executable: ${name}`);
			assert.equal(
				hashFile(resolve(root, "rust-service/target/release", name)),
				receipt.binaries[name],
				`Native executable changed: ${name}`,
			);
		}
	} catch (cause) {
		throw new Error(`Native benchmark build verification failed. ${rebuild}`, { cause });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [command, ...argumentsList] = process.argv.slice(2);
	if (command === "snapshot") console.log(nativeSourceHash());
	else if (command === "record") recordNativeBuild(argumentsList[0]);
	else {
		assert.equal(command, "check", "Use snapshot, record <hash>, or check <executables>");
		assert.ok(argumentsList.length > 0, "Specify at least one executable");
		verifyNativeBuild(argumentsList);
	}
}
