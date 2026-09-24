/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

/**
 * Selects the benchmark's workspace-local native output for both building and launching.
 * The explicit Cargo argument overrides any inherited `CARGO_TARGET_DIR`.
 */
export function getRustServiceArtifacts(rustServiceDirectory: string): {
	readonly buildArguments: readonly string[];
	readonly executable: string;
} {
	const targetDirectory = path.join(rustServiceDirectory, "target");
	return {
		buildArguments: [
			"build",
			"--locked",
			"-p",
			"sea-webtransport-server",
			"--release",
			"--features",
			"websocket-stream",
			"--target-dir",
			targetDirectory,
		],
		executable: path.join(targetDirectory, "release", "sea-webtransport-server"),
	};
}
