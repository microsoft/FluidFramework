/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Run webpack for a named scenario under ./scenarios/<name>.
// Usage: npm run webpack:scenario -- <scenario-name>
// Run with no argument to list available scenarios.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(repoRoot, "scenarios");

function listScenarios(): string[] {
	if (!existsSync(scenariosDir)) {
		return [];
	}
	return readdirSync(scenariosDir).filter((name) => {
		const dir = path.join(scenariosDir, name);
		return statSync(dir).isDirectory() && existsSync(path.join(dir, "webpack.config.cts"));
	});
}

const scenario = process.argv[2];
const available = listScenarios();

if (scenario === undefined) {
	console.log("Usage: npm run webpack:scenario -- <scenario-name>");
	console.log("");
	console.log("Available scenarios:");
	if (available.length === 0) {
		console.log("  (none found in ./scenarios)");
	} else {
		for (const name of available) {
			console.log(`  ${name}`);
		}
	}
	process.exit(1);
}

if (!available.includes(scenario)) {
	console.error(`Unknown scenario: ${scenario}`);
	console.error(`Available: ${available.join(", ") || "(none)"}`);
	process.exit(1);
}

const configPath = path.join(scenariosDir, scenario, "webpack.config.cts");
const result = spawnSync("npx", ["webpack", "--config", path.relative(repoRoot, configPath)], {
	cwd: repoRoot,
	stdio: "inherit",
	shell: true,
});
process.exit(result.status ?? 1);
