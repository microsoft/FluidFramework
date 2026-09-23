/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const rustDirectory = path.resolve(packageDirectory, "../..");
const configurations = {
	memory: ["memory"],
	webtransport: ["webtransport"],
	websocket: ["websocket-stream"],
	combined: ["memory", "webtransport"],
	"combined-compression": ["memory", "webtransport", "compression"],
	"memory-compression": ["memory", "compression"],
	"webtransport-compression": ["webtransport", "compression"],
};
const measure = process.argv.includes("--measure");
const requested = process.argv.slice(2).filter((argument) => argument !== "--measure");
const selected = requested.length === 0 ? Object.keys(configurations) : requested;
for (const name of selected) {
	if (!Object.hasOwn(configurations, name)) {
		throw new Error(`Unknown WASM configuration: ${name}`);
	}
}
if (measure) {
	const artifacts = selected.flatMap((name) =>
		["web", "node"].flatMap((target) =>
			["sea_wasm.js", "sea_wasm_bg.wasm"].map((file) => {
				const contents = readFileSync(
					path.join(packageDirectory, "generated", name, target, file),
				);
				return {
					configuration: name,
					features: configurations[name],
					target,
					file,
					sha256: createHash("sha256").update(contents).digest("hex"),
					bytes: contents.length,
					gzipBytes: gzipSync(contents, { level: 9 }).length,
					brotliBytes: brotliCompressSync(contents, {
						params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
					}).length,
				};
			}),
		),
	);
	console.log(
		JSON.stringify(
			{
				node: process.version,
				platform: `${process.platform}/${process.arch}`,
				rustc: execFileSync("rustc", ["--version"], {
					cwd: rustDirectory,
					encoding: "utf8",
				}).trim(),
				wasmBindgen: execFileSync("wasm-bindgen", ["--version"], { encoding: "utf8" }).trim(),
				compression: { gzipLevel: 9, brotliQuality: 11 },
				artifacts,
			},
			null,
			2,
		),
	);
} else
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
					`${JSON.stringify(target === "web" ? { type: "module" } : { type: "commonjs", browser: { "./sea_wasm.js": false } })}\n`,
				);
			}
			rmSync(outputDirectory, { recursive: true, force: true });
			renameSync(temporaryDirectory, outputDirectory);
		} finally {
			rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	}
