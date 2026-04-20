/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * One-off script that builds the bundle at increasing sizes and collects
 * Lighthouse metrics for each, writing results to a CSV file.
 *
 * Supports three ballast modes:
 *
 * - padding: insert string padding via BannerPlugin (network cost only)
 *
 * - code: generated synthetic JS modules (network + parse/compile/execute)
 *
 * - both: runs padding then code sweeps into the same CSV for comparison
 *
 * Uses the Lighthouse Node API directly (instead of LHCI CLI) to avoid
 * chrome-launcher temp-dir cleanup errors on Windows that cause LHCI to
 * discard otherwise-successful results.
 *
 * Usage:
 *
 * npx tsx scripts/sweep.ts
 *
 * npx tsx scripts/sweep.ts --mode=code --throttle=mobile
 *
 * npx tsx scripts/sweep.ts --mode=both --iterations=5 --sizeStep=256
 *
 * Throttle profiles: desktop, mobile
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";

import type { Flags, Result, RunnerResult } from "lighthouse";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { throttleProfiles }: { throttleProfiles: Record<string, Partial<Flags>> } =
	require("../throttleProfiles.cjs");

const { values: args } = parseArgs({
	options: {
		iterations: { type: "string", default: "10" },
		sizeStep: { type: "string", default: "256" },
		mode: {
			type: "string",
			default: "padding",
			// padding | code | both
		},
		throttle: {
			type: "string",
			default: "mobile",
			// desktop | mobile
		},
		output: { type: "string", default: join(".lighthouseci", "lighthouse-sweep.csv") },
	},
});

const iterations = Number(args.iterations);
const sizeStep = Number(args.sizeStep); // KB per iteration
const csvPath = args.output ?? join(".lighthouseci", "lighthouse-sweep.csv");
const distDir = "dist";
const mode = args.mode ?? "padding";

const profileName = args.throttle ?? "mobile";
const profile: Partial<Flags> | undefined = throttleProfiles[profileName];
if (profile === undefined) {
	console.error(
		`Unknown throttle profile: "${profileName}". Options: ${Object.keys(throttleProfiles).join(", ")}`,
	);
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
}

const validModes = ["padding", "code", "both"];
if (!validModes.includes(mode)) {
	console.error(`Unknown mode: "${mode}". Options: ${validModes.join(", ")}`);
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
}

console.log(`Throttle profile: ${profileName}, mode: ${mode}`);

const mimeTypes: Record<string, string> = {
	".html": "text/html",
	".js": "application/javascript",
	".map": "application/json",
};

/**
 * Start a simple static file server for the dist directory.
 *
 * @returns the server and port.
 */
async function startServer(): Promise<{
	serv: ReturnType<typeof createServer>;
	port: number;
}> {
	return new Promise((resolve) => {
		const serv = createServer((req: IncomingMessage, res: ServerResponse) => {
			const filePath = join(distDir, req.url === "/" ? "index.html" : (req.url ?? ""));
			try {
				const data = readFileSync(filePath);
				const ext = extname(filePath);
				res.writeHead(200, {
					"Content-Type": mimeTypes[ext] ?? "application/octet-stream",
				});
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end("Not found");
			}
		});
		serv.listen(0, () => {
			resolve({ serv, port: (serv.address() as AddressInfo).port });
		});
	});
}

/**
 * Run Lighthouse against the given URL using the Node API.
 * Handles chrome-launcher cleanup errors gracefully.
 */
async function runLighthouse(targetUrl: string): Promise<Result | undefined> {
	const lighthouseModule = await import("lighthouse");
	const lighthouse = lighthouseModule.default;
	const { launch } = await import("chrome-launcher");

	const chrome = await launch({ chromeFlags: ["--headless"] });
	try {
		const result: RunnerResult | undefined = await lighthouse(targetUrl, {
			port: chrome.port,
			output: "json",
			onlyCategories: ["performance"],
			formFactor: "desktop",
			...profile,
			screenEmulation: {
				mobile: false,
				width: 1350,
				height: 940,
				deviceScaleFactor: 1,
				disabled: false,
			},
		});
		return result?.lhr;
	} finally {
		try {
			chrome.kill();
		} catch {
			// Ignore chrome-launcher cleanup errors on Windows.
		}
	}
}

function getAuditValue(lhr: Result, id: string): number | string {
	return lhr.audits[id]?.numericValue ?? "N/A";
}

/**
 * Approximate KB per generated ballast chunk (after minification).
 * Measured empirically: 50 chunks adds ~61 KB → ~1.22 KB/chunk.
 */
const APPROX_KB_PER_CHUNK = 1.25;

/**
 * Generate ballast chunks for the given target size in KB.
 * Returns the number of chunks generated.
 */
function generateBallast(targetKb: number): void {
	const chunks = Math.round(targetKb / APPROX_KB_PER_CHUNK);
	execSync(`npx tsx scripts/generateBallast.ts --chunks=${chunks}`, {
		stdio: "inherit",
	});
}

/**
 * Build the webpack bundle with the given padding (KB) and ballast mode.
 */
function build(ballastMode: "padding" | "code", targetKb: number): void {
	if (ballastMode === "code") {
		generateBallast(targetKb);
		execSync("npx webpack --env production --env paddingKb=0 --env ballast", {
			stdio: "inherit",
		});
	} else {
		execSync(`npx webpack --env production --env paddingKb=${targetKb}`, {
			stdio: "inherit",
		});
	}
}

const header = [
	"mode",
	"targetKb",
	"bundleSizeBytes",
	"firstContentfulPaint",
	"largestContentfulPaint",
	"speedIndex",
	"totalBlockingTime",
	"interactive",
	"performanceScore",
].join(",");

mkdirSync(dirname(csvPath), { recursive: true });
writeFileSync(csvPath, `${header}\n`);
console.log(`Created ${csvPath}`);

const { serv: httpServer, port } = await startServer();
const sweepUrl = `http://localhost:${port}/index.html`;
console.log(`Static server running on port ${port}`);

const modesToRun: ("padding" | "code")[] =
	mode === "both" ? ["padding", "code"] : [mode as "padding" | "code"];

try {
	for (const currentMode of modesToRun) {
		console.log(`\n>>> Starting sweep: mode=${currentMode} <<<`);

		for (let i = 0; i < iterations; i++) {
			const targetKb = i * sizeStep;
			console.log(
				`\n=== [${currentMode}] Iteration ${i + 1}/${iterations}: targetKb=${targetKb} ===`,
			);

			// Build
			console.log("Building...");
			build(currentMode, targetKb);

			// Get bundle size
			const bundleSizeBytes = statSync("dist/app.bundle.js").size;
			console.log(`Bundle size: ${(bundleSizeBytes / 1024).toFixed(0)} KB`);

			// Run Lighthouse
			console.log("Running Lighthouse...");
			const lhr = await runLighthouse(sweepUrl);

			if (lhr === undefined || lhr.runtimeError?.code !== undefined) {
				console.warn(
					`Lighthouse error: ${lhr?.runtimeError?.code ?? "no result"}, skipping iteration`,
				);
				continue;
			}

			const row = [
				currentMode,
				targetKb,
				bundleSizeBytes,
				getAuditValue(lhr, "first-contentful-paint"),
				getAuditValue(lhr, "largest-contentful-paint"),
				getAuditValue(lhr, "speed-index"),
				getAuditValue(lhr, "total-blocking-time"),
				getAuditValue(lhr, "interactive"),
				(lhr.categories?.performance?.score ?? 0) * 100,
			].join(",");

			writeFileSync(csvPath, `${readFileSync(csvPath, "utf8")}${row}\n`);
			console.log(`Recorded: ${row}`);

			// Brief pause to let Chrome fully release resources on Windows.
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}
} finally {
	httpServer.close();
}

console.log(`\nDone! Results in ${csvPath}`);
