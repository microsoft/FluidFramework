/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Build and open source-map-explorer for a scenario under ./scenarios/<name>.
// Usage: npm run explore:scenario -- <scenario-name>
// Run with no argument to list available scenarios.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(repoRoot, "scenarios");

function listScenarios() {
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

if (!scenario) {
	console.log("Usage: npm run explore:scenario -- <scenario-name>");
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

const scenarioDir = path.join(scenariosDir, scenario);
const configPath = path.join(scenarioDir, "webpack.config.cts");

function run(cmd, args) {
	const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", shell: true });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

run("npx", ["webpack", "--config", path.relative(repoRoot, configPath)]);

const bundlePath = path.join(repoRoot, "build", "scenarios", scenario, `${scenario}.js`);
if (!existsSync(bundlePath)) {
	console.error(`Bundle not found after webpack: ${bundlePath}`);
	process.exit(1);
}

const reportDir = path.join(repoRoot, "bundleAnalysis");
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `report-${scenario}.html`);

run("npx", [
	"source-map-explorer",
	path.relative(repoRoot, bundlePath),
	"--html",
	path.relative(repoRoot, reportPath),
]);
