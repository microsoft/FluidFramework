/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { x as extractTar } from "tar";
import unzipper from "unzipper";

const version = "3.0.0";
// Source: https://github.com/tylerbutler/linkcheck-bin/blob/f4ab688ade7f57f902c12c0e4dfff854d74c1439/data/3.0.0-checksums.txt
const checksums = {
	"linux-arm64": "583fc8cf760a3732a20a9d751903351772d91f046c2080244b96e2b1021eb501",
	"linux-x64": "817629c7077cea9bef4b9d66d5b8d029575e103da3fea9c49d55b45083a8e786",
	"macos-arm64": "cb185308e2e05ecf5b129a7dca7d283cf5e9ee13e521041414562dd273b2d633",
	"macos-x64": "a51f00fadbb96a4a95316b8a35a609cd929de91b8d8058b4f8de5089d6c9714e",
	"windows-x64": "c845e8167cbf41844ed0c0f8a21be06d798c36645e33ae0ec7ca2e8c8247e644",
};

/**
 * Download and extract the pinned linkcheck release after SHA-256 verification.
 * @param {string} directory - An empty directory for the release.
 * @param {string} platform - The Node.js platform.
 * @param {string} arch - The Node.js architecture.
 */
export async function installLinkcheck(
	directory,
	platform = process.platform,
	arch = process.arch,
) {
	const os = { linux: "linux", darwin: "macos", win32: "windows" }[platform];
	const checksum = checksums[`${os}-${arch}`];
	if (checksum === undefined) {
		throw new Error(`Unsupported linkcheck platform: ${platform} ${arch}`);
	}

	const filename = `linkcheck-${version}-${os}-${arch}.${platform === "win32" ? "zip" : "tar.gz"}`;
	const url = `https://github.com/filiph/linkcheck/releases/download/${version}/${filename}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Cannot download ${url}: HTTP ${response.status}`);
	}
	const archive = Buffer.from(await response.arrayBuffer());
	if (createHash("sha256").update(archive).digest("hex") !== checksum) {
		throw new Error(`SHA-256 mismatch for ${filename}`);
	}

	if (platform === "win32") {
		const zip = await unzipper.Open.buffer(archive);
		await zip.extract({ path: directory });
	} else {
		const archivePath = path.join(directory, filename);
		await writeFile(archivePath, archive);
		await extractTar({ file: archivePath, cwd: directory, strict: true });
		await chmod(path.join(directory, "linkcheck", "linkcheck"), 0o755);
	}
}

async function main() {
	const directory = await mkdtemp(path.join(tmpdir(), "fluid-linkcheck-"));
	try {
		await installLinkcheck(directory);
		const root = path.join(directory, "linkcheck");
		// Run the Windows launcher directly through Dart to avoid shell argument parsing.
		const executable =
			process.platform === "win32"
				? path.join(root, "src", "dart.exe")
				: path.join(root, "linkcheck");
		const args = [
			...(process.platform === "win32" ? [path.join(root, "src", "linkcheck.snapshot")] : []),
			...process.argv.slice(2),
		];
		const child = spawn(executable, args, { stdio: "inherit" });
		await new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				if (signal !== null) {
					reject(new Error(`linkcheck stopped with signal ${signal}`));
				} else {
					process.exitCode = code;
					resolve();
				}
			});
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
