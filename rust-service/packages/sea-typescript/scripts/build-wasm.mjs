/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const rustDirectory = path.resolve(packageDirectory, "../..");
const configurations = {
	memory: ["memory"],
	webtransport: ["webtransport"],
	websocket: ["websocket-stream"],
	combined: ["memory", "webtransport"],
	"memory-compression": ["memory", "compression"],
	"webtransport-compression": ["webtransport", "compression"],
};
const requested = process.argv.slice(2);
const selected = requested.length === 0 ? Object.keys(configurations) : requested;
for (const name of selected) {
	if (!Object.hasOwn(configurations, name)) {
		throw new Error(`Unknown WASM configuration: ${name}`);
	}
}

for (const name of selected) {
	const targetDirectory = path.resolve(
		rustDirectory,
		process.env.CARGO_TARGET_DIR ?? "target",
		"sea-wasm",
		name,
	);
	const outputDirectory = path.join(packageDirectory, "generated", name);
	const temporaryDirectory = `${outputDirectory}.building`;
	const env = {
		...process.env,
		CARGO_TARGET_DIR: targetDirectory,
		RUSTFLAGS: [
			process.env.RUSTFLAGS,
			"--cfg=web_sys_unstable_apis",
			"-C target-feature=+simd128",
		]
			.filter(Boolean)
			.join(" "),
	};
	execFileSync(
		"cargo",
		[
			"build",
			"--locked",
			"-p",
			"sea-wasm",
			"--lib",
			"--target",
			"wasm32-unknown-unknown",
			"--release",
			"--no-default-features",
			"--features",
			configurations[name].join(","),
		],
		{ cwd: rustDirectory, env, stdio: "inherit" },
	);
	rmSync(temporaryDirectory, { recursive: true, force: true });
	try {
		for (const [target, directory] of [
			["web", "web"],
			["nodejs", "node"],
		]) {
			const output = path.join(temporaryDirectory, directory);
			mkdirSync(output, { recursive: true });
			execFileSync(
				"wasm-bindgen",
				[
					path.join(targetDirectory, "wasm32-unknown-unknown/release/sea_wasm.wasm"),
					"--target",
					target,
					"--out-name",
					"sea_wasm",
					"--out-dir",
					output,
				],
				{ cwd: rustDirectory, stdio: "inherit" },
			);
			writeFileSync(
				path.join(output, "package.json"),
				`${JSON.stringify({ type: target === "web" ? "module" : "commonjs" })}\n`,
			);
		}
		rmSync(outputDirectory, { recursive: true, force: true });
		renameSync(temporaryDirectory, outputDirectory);
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}
