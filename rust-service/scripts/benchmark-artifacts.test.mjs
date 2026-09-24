/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
	nativeSourceHash,
	recordNativeBuild,
	verifyNativeBuild,
} from "./benchmark-artifacts.mjs";

function fixture(t) {
	const root = mkdtempSync(resolve(tmpdir(), "sea-build-receipt-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	execFileSync("git", ["init", "--quiet", root]);
	mkdirSync(resolve(root, "rust-service/crates/example/src"), { recursive: true });
	mkdirSync(resolve(root, "rust-service/target/release"), { recursive: true });
	writeFileSync(resolve(root, ".gitignore"), "target/\n");
	writeFileSync(resolve(root, "rust-service/Cargo.toml"), "[workspace]\n");
	writeFileSync(resolve(root, "rust-service/Cargo.lock"), "version = 4\n");
	writeFileSync(
		resolve(root, "rust-service/crates/example/src/lib.rs"),
		"pub fn example() {}\n",
	);
	for (const name of [
		"sea-benchmarks",
		"sea-webtransport-server",
		"presentation-native",
		"presentation-test-spans",
		"storage-pipeline",
	]) {
		writeFileSync(resolve(root, "rust-service/target/release", name), name);
	}
	return root;
}

test("accepts a recorded build, including after documentation-only edits", (t) => {
	const root = fixture(t);
	recordNativeBuild(nativeSourceHash(root), root);
	writeFileSync(
		resolve(root, "rust-service/crates/example/README.md"),
		"Updated documentation\n",
	);
	verifyNativeBuild(["sea-webtransport-server", "presentation-native"], root);
});

test("rejects binaries that exist without a completed build receipt", (t) => {
	const root = fixture(t);
	assert.throws(() => verifyNativeBuild(["presentation-native"], root), /Rebuild with/);
});

test("rejects changed, added, and removed native inputs", (t) => {
	const root = fixture(t);
	for (const file of [
		"rust-service/crates/example/src/lib.rs",
		"rust-service/crates/example/src/new.rs",
		"rust-service/Cargo.lock",
	]) {
		recordNativeBuild(nativeSourceHash(root), root);
		writeFileSync(resolve(root, file), "changed\n");
		assert.throws(() => verifyNativeBuild(["presentation-native"], root), /Rebuild with/);
	}
	recordNativeBuild(nativeSourceHash(root), root);
	rmSync(resolve(root, "rust-service/crates/example/src/new.rs"));
	assert.throws(() => verifyNativeBuild(["presentation-native"], root), /Rebuild with/);
});

test("rejects a replaced or missing generator even when the server still matches", (t) => {
	const root = fixture(t);
	recordNativeBuild(nativeSourceHash(root), root);
	const generator = resolve(root, "rust-service/target/release/presentation-native");
	writeFileSync(generator, "stale executable");
	verifyNativeBuild(["sea-webtransport-server"], root);
	assert.throws(
		() => verifyNativeBuild(["sea-webtransport-server", "presentation-native"], root),
		/Rebuild with/,
	);
	rmSync(generator);
	assert.throws(() => verifyNativeBuild(["presentation-native"], root), /Rebuild with/);
});

test("does not certify a build whose source changed during compilation", (t) => {
	const root = fixture(t);
	const before = nativeSourceHash(root);
	writeFileSync(resolve(root, "rust-service/Cargo.toml"), "changed\n");
	assert.throws(() => recordNativeBuild(before, root), /sources changed during build/);
	assert.equal(
		existsSync(resolve(root, "rust-service/target/release/benchmark-build.json")),
		false,
	);
});

test("native campaign rejects stale artifacts before writing its manifest or starting cells", (t) => {
	const root = fixture(t);
	cpSync(import.meta.dirname, resolve(root, "rust-service/scripts"), { recursive: true });
	recordNativeBuild(nativeSourceHash(root), root);
	writeFileSync(resolve(root, "rust-service/target/release/presentation-native"), "stale");
	const output = resolve(root, "campaign");
	const result = spawnSync(
		process.execPath,
		[resolve(root, "rust-service/scripts/benchmark-collect.mjs"), "native-repeat", output],
		{ encoding: "utf8", timeout: 10_000 },
	);
	assert.equal(result.status, 1, result.stderr);
	assert.match(result.stderr, /Native executable changed: presentation-native/);
	assert.equal(existsSync(resolve(output, "manifest.json")), false);
});

test("a failed Cargo build invalidates the previous receipt", (t) => {
	const root = fixture(t);
	cpSync(import.meta.dirname, resolve(root, "rust-service/scripts"), { recursive: true });
	const bin = resolve(root, "bin");
	mkdirSync(bin);
	writeFileSync(resolve(bin, "cargo"), "#!/bin/sh\nexit 17\n");
	chmodSync(resolve(bin, "cargo"), 0o755);
	recordNativeBuild(nativeSourceHash(root), root);
	const result = spawnSync(
		"bash",
		[resolve(root, "rust-service/scripts/build-benchmark-artifacts.sh")],
		{
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				CARGO_TARGET_DIR: resolve(root, "cargo-target"),
			},
			encoding: "utf8",
			timeout: 10_000,
		},
	);
	assert.equal(result.status, 17, result.stderr);
	assert.throws(() => verifyNativeBuild(["presentation-native"], root), /Rebuild with/);
});

for (const [script, args] of [
	["benchmark-collect.mjs", ["source"]],
	["benchmark-summaries.mjs", ["campaign", '{"repetitions":1}']],
	["benchmark-summaries.mjs", ["run", '{"backend":"sea"}']],
	[
		"benchmark-stress.mjs",
		[
			"run",
			'{"backend":"sea","rate":400,"payloadBytes":64,"documents":4,"cores":4,"seconds":2,"warmupSeconds":1}',
		],
	],
]) {
	test(`${script} ${args[0]} rejects unverified default binaries`, (t) => {
		const root = fixture(t);
		cpSync(import.meta.dirname, resolve(root, "rust-service/scripts"), { recursive: true });
		const output = resolve(root, "output");
		const result = spawnSync(
			process.execPath,
			[resolve(root, "rust-service/scripts", script), ...args, output],
			{ encoding: "utf8", timeout: 10_000 },
		);
		assert.equal(result.status, 1, result.stderr);
		assert.match(result.stderr, /Native benchmark build verification failed/);
		assert.equal(existsSync(resolve(output, "manifest.json")), false);
		assert.equal(existsSync(resolve(output, "result.json")), false);
	});
}
