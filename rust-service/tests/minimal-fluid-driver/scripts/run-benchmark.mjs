import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

const caseTitles = new Map([
	["rust-local", "Rust local memory"],
	["local", "TypeScript local service"],
	["rust-memory", "Rust WebTransport memory"],
	["rust-buffered", "Rust WebTransport buffered file"],
	["rust-durable", "Rust WebTransport durable file"],
	["tinylicious", "Tinylicious"],
]);

const selectedCases = new Set();
const environment = { FLUID_TEST_VERBOSE: "1", ...process.env };
let grep;
let reportPath;

for (let index = 0; index < process.argv.slice(2).length; index++) {
	const argumentsList = process.argv.slice(2);
	const argument = argumentsList[index];
	const value = (name) => {
		const next = argumentsList[++index];
		if (next === undefined || next.startsWith("--")) {
			throw new Error(`${name} requires a value`);
		}
		return next;
	};

	switch (argument) {
		case "--case":
			for (const name of value("--case").split(",")) {
				selectedCases.add(name);
			}
			break;
		case "--grep":
			grep = value("--grep");
			break;
		case "--workload":
			environment.BENCHMARK_WORKLOAD = value("--workload");
			break;
		case "--dds":
			environment.BENCHMARK_DDS = value("--dds");
			break;
		case "--repetitions":
			environment.BENCHMARK_REPETITIONS = value("--repetitions");
			break;
		case "--operations":
			environment.BENCHMARK_OPERATIONS = value("--operations");
			break;
		case "--warmup":
			environment.BENCHMARK_WARMUP = value("--warmup");
			break;
		case "--operations-per-turn":
			environment.BENCHMARK_OPERATIONS_PER_TURN = value("--operations-per-turn");
			break;
		case "--synchronize-per-turn":
			environment.BENCHMARK_SYNCHRONIZE_PER_TURN = "1";
			break;
		case "--no-synchronize-per-turn":
			environment.BENCHMARK_SYNCHRONIZE_PER_TURN = "0";
			break;
		case "--browser-timeout-ms":
			environment.BENCHMARK_BROWSER_TIMEOUT_MS = value("--browser-timeout-ms");
			break;
		case "--artifact-dir":
			environment.BENCHMARK_ARTIFACT_DIR = value("--artifact-dir");
			break;
		case "--profile": {
			const next = argumentsList[index + 1];
			environment.BENCHMARK_CPU_PROFILE_PATH =
				next === undefined || next.startsWith("--")
					? "benchmark-results/browser.cpuprofile"
					: argumentsList[++index];
			break;
		}
		case "--skip-build":
		case "--no-build":
			environment.BENCHMARK_SKIP_BUILD = "1";
			break;
		case "--report":
			reportPath = value("--report");
			break;
		case "--list-cases":
			printCases();
			process.exit(0);
			break;
		case "--help":
		case "-h":
			printHelp();
			process.exit(0);
			break;
		case "--":
			break;
		default:
			throw new Error(`unknown argument ${JSON.stringify(argument)}; use --help`);
	}
}

if (grep !== undefined && selectedCases.size > 0) {
	throw new Error("--grep and --case cannot be used together");
}
if (selectedCases.has("all") && selectedCases.size > 1) {
	throw new Error("--case all cannot be combined with other cases");
}
if (selectedCases.size > 0 && !selectedCases.has("all")) {
	const titles = [...selectedCases].map((name) => {
		const title = caseTitles.get(name);
		if (title === undefined) {
			throw new Error(`unknown case ${JSON.stringify(name)}; use --list-cases`);
		}
		return escapeRegularExpression(title);
	});
	grep = titles.join("|");
}

const mochaArguments = [];
if (grep !== undefined) {
	mochaArguments.push("--grep", grep);
}
if (reportPath !== undefined) {
	mkdirSync(path.dirname(path.resolve(packageDirectory, reportPath)), { recursive: true });
	mochaArguments.push("--reporterOptions", `reportFile=${reportPath}`);
}
const child = spawn("pnpm", ["run", "bench", "--", ...mochaArguments], {
	cwd: packageDirectory,
	env: environment,
	stdio: ["inherit", "pipe", "pipe"],
});
child.stdout.pipe(process.stdout, { end: false });
child.stderr.pipe(process.stdout, { end: false });
process.exitCode = await new Promise((resolve, reject) => {
	child.once("error", reject);
	child.once("close", (code) => resolve(code ?? 1));
});

function escapeRegularExpression(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function printCases() {
	console.log("Benchmark case aliases:");
	for (const [alias, title] of caseTitles) {
		console.log(`  ${alias.padEnd(14)} ${title}`);
	}
	console.log("  all            all cases (default)");
}

function printHelp() {
	console.log(`Run SharedTree service benchmarks through the standard Mocha benchmark harness.

Usage:
  pnpm run bench:run -- [options]

Selection:
  --case <aliases>             Case alias, comma-separated or repeated (default: all)
  --grep <pattern>             Raw Mocha regular expression; cannot be combined with --case
  --list-cases                 Print aliases and exit

Workload:
	--dds <name>                 dummy or shared-tree (default: dummy)
	--workload <name>            batched, turns, or messages (default: turns, 1 edit/turn)
	--repetitions <count>        Browser samples per case (default: 3)
	--operations <count>         Measured edits per sample (default: 250)
	--warmup <count>             Warmup edits per sample (default: 10)
	--operations-per-turn <n>    Override edits per Fluid batch
	--synchronize-per-turn       Wait for observer convergence after every turn
  --no-synchronize-per-turn    Disable per-turn convergence
  --browser-timeout-ms <ms>    Per-sample browser timeout

Output and setup:
  --artifact-dir <path>        Detailed JSON directory (default: benchmark-results)
  --report <path>              Standard Mocha benchmark report path
  --profile [path]             Capture Chromium CPU profiles; case/repetition suffixes are added
  --skip-build, --no-build     Skip selected-case native or Tinylicious incremental builds
  --help, -h                   Print this help

Examples:
  pnpm run bench:run -- --case rust-local --operations 100
	pnpm run bench:run -- --case rust-local --dds shared-tree
  pnpm run bench:run -- --case rust-memory,local --workload messages
  pnpm run bench:run -- --case rust-memory --repetitions 3 --profile
`);
	printCases();
}
