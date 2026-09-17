/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const crateDirectory = path.resolve(scriptDirectory, "..");
const rustServiceDirectory = path.resolve(crateDirectory, "../..");
const targetDirectory = path.join(rustServiceDirectory, "target");
const releaseDirectory = path.join(targetDirectory, "wasm32-unknown-unknown", "release");
const packageDirectory = path.join(crateDirectory, "pkg");
const webOutput = path.join(packageDirectory, "web");
const nodeOutput = path.join(packageDirectory, "node");
const testSupportDirectory = path.join(crateDirectory, "test-support", "pkg");
const testWebOutput = path.join(testSupportDirectory, "web");
const testNodeOutput = path.join(testSupportDirectory, "node");
const rustFlags = [
	process.env.RUSTFLAGS,
	"--cfg=web_sys_unstable_apis",
	"-C target-feature=+simd128",
]
	.filter(Boolean)
	.join(" ");

function run(command, args, options = {}) {
	execFileSync(command, args, {
		cwd: rustServiceDirectory,
		stdio: "inherit",
		...options,
	});
}

run(
	"cargo",
	[
		"build",
		"--quiet",
		"--locked",
		"-p",
		"sea-webtransport",
		"--lib",
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	],
	{
		env: {
			...process.env,
			RUSTFLAGS: rustFlags,
		},
	},
);

rmSync(packageDirectory, { recursive: true, force: true });
const wasm = path.join(releaseDirectory, "sea_webtransport.wasm");
run("wasm-bindgen", [
	wasm,
	"--target",
	"web",
	"--out-name",
	"sea_webtransport",
	"--out-dir",
	webOutput,
]);
writeFileSync(path.join(webOutput, "package.json"), '{"type":"module"}\n');
run("wasm-bindgen", [
	wasm,
	"--target",
	"nodejs",
	"--out-name",
	"sea_webtransport",
	"--out-dir",
	nodeOutput,
]);

run(
	"cargo",
	[
		"build",
		"--quiet",
		"--locked",
		"-p",
		"sea-webtransport",
		"--lib",
		"--features",
		"test-support",
		"--target",
		"wasm32-unknown-unknown",
		"--release",
	],
	{
		env: {
			...process.env,
			RUSTFLAGS: rustFlags,
		},
	},
);

rmSync(testSupportDirectory, { recursive: true, force: true });
run("wasm-bindgen", [
	wasm,
	"--target",
	"web",
	"--out-name",
	"sea_webtransport_test_support",
	"--out-dir",
	testWebOutput,
]);
writeFileSync(path.join(testWebOutput, "package.json"), '{"type":"module"}\n');
run("wasm-bindgen", [
	wasm,
	"--target",
	"nodejs",
	"--out-name",
	"sea_webtransport_test_support",
	"--out-dir",
	testNodeOutput,
]);
