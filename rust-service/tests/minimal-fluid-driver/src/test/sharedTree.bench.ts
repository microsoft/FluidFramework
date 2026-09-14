import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	benchmarkIt,
	currentBenchmarkMode,
	BenchmarkMode,
	type CollectedData,
	ValueType,
} from "@fluid-tools/benchmark";

interface BenchmarkCase {
	readonly title: string;
	readonly slug: string;
	readonly backend: "rust-local" | "rust" | "local" | "tinylicious";
	readonly storageMode?: "memory" | "buffered-file" | "durable-file";
}

interface BenchmarkOutput {
	readonly status: "passed";
	readonly aggregates: {
		readonly startupMilliseconds: Distribution;
		readonly submissionMilliseconds: Distribution;
		readonly convergenceMilliseconds: Distribution;
		readonly operationsPerSecond: Distribution;
	};
	readonly environment: {
		readonly serviceProcess: null | {
			readonly cpuSeconds: number;
			readonly peakResidentSetKiB: number;
		};
	};
	readonly samples: readonly Record<string, unknown>[];
}

interface Distribution {
	readonly mean: number;
}

interface RunningService {
	readonly process: ChildProcess;
	readonly transportUrl?: string;
	readonly certificateHash?: string;
	readonly port?: number;
	stop(): Promise<void>;
}

interface BenchmarkConfiguration {
	readonly repetitions: number;
	readonly operations: number;
	readonly warmup: number;
	readonly workload: "batched" | "turns" | "messages";
	readonly operationsPerTurn: number | undefined;
	readonly synchronizePerTurn: boolean;
	readonly browserTimeoutMilliseconds: number;
	readonly skipBuild: boolean;
}

const packageDirectory = path.resolve(import.meta.dirname, "../..");
const repositoryDirectory = path.resolve(packageDirectory, "../../..");
const rustServiceDirectory = path.join(repositoryDirectory, "rust-service");
const tinyliciousDirectory = path.join(
	repositoryDirectory,
	"server/routerlicious/packages/tinylicious",
);
const webTransportTestDirectory = path.join(
	rustServiceDirectory,
	"tests/webtransport-browser",
);

const cases: readonly BenchmarkCase[] = [
	{ title: "Rust local memory", slug: "rust-local-memory", backend: "rust-local" },
	{ title: "TypeScript local service", slug: "typescript-local", backend: "local" },
	{
		title: "Rust WebTransport memory",
		slug: "rust-webtransport-memory",
		backend: "rust",
		storageMode: "memory",
	},
	{
		title: "Rust WebTransport buffered file",
		slug: "rust-webtransport-buffered-file",
		backend: "rust",
		storageMode: "buffered-file",
	},
	{
		title: "Rust WebTransport durable file",
		slug: "rust-webtransport-durable-file",
		backend: "rust",
		storageMode: "durable-file",
	},
	{ title: "Tinylicious", slug: "tinylicious", backend: "tinylicious" },
];

const configuration = readConfiguration();

describe(configurationSuiteName(configuration), () => {
	for (const benchmarkCase of cases) {
		benchmarkIt({
			title: benchmarkCase.title,
			category: "SharedTree service",
			correctnessTimeoutMs: 120_000,
			run: async () => runCase(benchmarkCase, configuration),
		});
	}
});

async function runCase(
	benchmarkCase: BenchmarkCase,
	configuration: BenchmarkConfiguration,
): Promise<CollectedData> {
	const profilePath = profilePathForCase(benchmarkCase.slug);
	if (profilePath !== undefined) {
		await mkdir(path.dirname(profilePath), { recursive: true });
	}
	if (!configuration.skipBuild) {
		buildPrerequisites(benchmarkCase);
	}

	const service = await startService(benchmarkCase);
	try {
		const environment = {
			...process.env,
			BENCHMARK_BROWSER_TIMEOUT_MS: String(configuration.browserTimeoutMilliseconds),
			BENCHMARK_OPERATIONS_PER_TURN:
				configuration.operationsPerTurn === undefined
					? undefined
					: String(configuration.operationsPerTurn),
			BENCHMARK_SYNCHRONIZE_PER_TURN: configuration.synchronizePerTurn ? "1" : "0",
			BENCHMARK_TINYLICIOUS_PORT:
				service?.port === undefined ? undefined : String(service.port),
			FLUID_SERVICE_STORAGE_MODE: benchmarkCase.storageMode,
			BENCHMARK_SERVER_PID:
				service?.process.pid === undefined ? undefined : String(service.process.pid),
			BENCHMARK_CPU_PROFILE_PATH: profilePath,
		};
		const argumentsList = [
			path.join(packageDirectory, "browser/run-shared-tree-benchmark.mjs"),
			benchmarkCase.backend,
			String(configuration.repetitions),
			String(configuration.operations),
			String(configuration.warmup),
		];
		if (benchmarkCase.backend === "rust") {
			argumentsList.push(
				service?.transportUrl ?? fail("Rust service did not provide a transport URL"),
				service?.certificateHash ?? fail("Rust service did not provide a certificate hash"),
			);
		}
		const execution = spawnSync(process.execPath, argumentsList, {
			cwd: packageDirectory,
			encoding: "utf8",
			env: environment,
			maxBuffer: 20 * 1024 * 1024,
		});
		if (execution.status !== 0) {
			throw new Error(
				`benchmark runner failed (${execution.status ?? execution.signal}):\n${execution.stdout}\n${execution.stderr}`,
			);
		}
		const output = parseOutput(execution.stdout);
		const artifactDirectory = path.resolve(
			packageDirectory,
			process.env.BENCHMARK_ARTIFACT_DIR ?? "benchmark-results",
		);
		await mkdir(artifactDirectory, { recursive: true });
		await writeFile(
			path.join(artifactDirectory, `${benchmarkCase.slug}-${configuration.workload}.json`),
			`${JSON.stringify(output, undefined, 2)}\n`,
		);
		return measurements(output);
	} finally {
		await service?.stop();
	}
}

function readConfiguration(): BenchmarkConfiguration {
	const performance = currentBenchmarkMode === BenchmarkMode.Performance;
	const workload = process.env.BENCHMARK_WORKLOAD ?? "turns";
	if (workload !== "batched" && workload !== "turns" && workload !== "messages") {
		throw new Error("BENCHMARK_WORKLOAD must be batched, turns, or messages");
	}
	const configuredOperationsPerTurn = optionalPositiveInteger("BENCHMARK_OPERATIONS_PER_TURN");
	const operationsPerTurn = configuredOperationsPerTurn ?? 1;
	const synchronizePerTurn =
		booleanEnvironmentVariable("BENCHMARK_SYNCHRONIZE_PER_TURN") ?? workload === "messages";
	if (synchronizePerTurn && operationsPerTurn === undefined) {
		throw new Error("per-turn synchronization requires BENCHMARK_OPERATIONS_PER_TURN");
	}
	return {
		repetitions: positiveInteger("BENCHMARK_REPETITIONS", performance ? 3 : 1),
		operations: positiveInteger("BENCHMARK_OPERATIONS", performance ? 250 : 10),
		warmup: nonnegativeInteger("BENCHMARK_WARMUP", performance ? 10 : 1),
		workload,
		operationsPerTurn,
		synchronizePerTurn,
		browserTimeoutMilliseconds: positiveInteger(
			"BENCHMARK_BROWSER_TIMEOUT_MS",
			workload === "messages" ? 180_000 : 30_000,
		),
		skipBuild: booleanEnvironmentVariable("BENCHMARK_SKIP_BUILD") ?? false,
	};
}

function configurationSuiteName(configuration: BenchmarkConfiguration): string {
	return `SharedTree service (workload=${configuration.workload}, operations=${configuration.operations}, warmup=${configuration.warmup}, operationsPerTurn=${configuration.operationsPerTurn ?? "unbounded"}, synchronizePerTurn=${configuration.synchronizePerTurn}, repetitions=${configuration.repetitions})`;
}

function buildPrerequisites(benchmarkCase: BenchmarkCase): void {
	if (benchmarkCase.backend === "rust") {
		run("cargo", ["build", "--locked", "-p", "fluid-webtransport-native", "--release"], {
			cwd: rustServiceDirectory,
		});
		ensureCertificate();
	}
	if (benchmarkCase.backend === "tinylicious") {
		if (!existsSync(path.join(repositoryDirectory, "server/routerlicious/node_modules"))) {
			throw new Error(
				"Tinylicious dependencies are missing; run pnpm install in server/routerlicious",
			);
		}
		run("pnpm", ["--filter", "tinylicious...", "run", "build:compile"], {
			cwd: path.join(repositoryDirectory, "server/routerlicious"),
		});
	}
}

async function startService(
	benchmarkCase: BenchmarkCase,
): Promise<RunningService | undefined> {
	if (benchmarkCase.backend === "rust") {
		return startRustService(benchmarkCase.storageMode ?? "durable-file");
	}
	if (benchmarkCase.backend === "tinylicious") {
		return startTinylicious();
	}
	return undefined;
}

async function startRustService(storageMode: string): Promise<RunningService> {
	ensureCertificate();
	const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "fluid-rust-benchmark-"));
	const certificateDirectory = path.join(webTransportTestDirectory, ".certs");
	const child = spawn(
		path.join(rustServiceDirectory, "target/release/fluid-webtransport-native"),
		[
			"127.0.0.1:0",
			path.join(certificateDirectory, "cert.pem"),
			path.join(certificateDirectory, "key.pem"),
			path.join(temporaryDirectory, "data"),
		],
		{
			cwd: repositoryDirectory,
			env: { ...process.env, FLUID_SERVICE_STORAGE_MODE: storageMode },
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let output: RegExpMatchArray;
	try {
		output = await waitForOutput(child, /^WEBTRANSPORT_URL=(.+)$/mu, 30_000);
	} catch (error) {
		await stopProcess(child);
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}
	child.stdout?.resume();
	child.stderr?.resume();
	const certificateHash = (
		await readFile(path.join(certificateDirectory, "cert.sha256"), "utf8")
	).trim();
	return {
		process: child,
		transportUrl: output[1] ?? fail("Rust service output omitted its transport URL"),
		certificateHash,
		stop: async () => {
			await stopProcess(child);
			await rm(temporaryDirectory, { recursive: true, force: true });
		},
	};
}

async function startTinylicious(): Promise<RunningService> {
	const port = await freePort();
	const temporaryDirectory = await mkdtemp(
		path.join(tmpdir(), "fluid-tinylicious-benchmark-"),
	);
	const child = spawn(
		process.execPath,
		[path.join(tinyliciousDirectory, "dist/index.js"), "--port", String(port)],
		{
			cwd: temporaryDirectory,
			stdio: "ignore",
		},
	);
	try {
		await waitForPort(child, port, 30_000);
	} catch (error) {
		await stopProcess(child);
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}
	return {
		process: child,
		port,
		stop: async () => {
			await stopProcess(child);
			await rm(temporaryDirectory, { recursive: true, force: true });
		},
	};
}

function ensureCertificate(): void {
	const certificateDirectory = path.join(webTransportTestDirectory, ".certs");
	if (
		existsSync(path.join(certificateDirectory, "cert.pem")) &&
		existsSync(path.join(certificateDirectory, "key.pem")) &&
		existsSync(path.join(certificateDirectory, "cert.sha256"))
	) {
		return;
	}
	run("sh", [path.join(webTransportTestDirectory, "generate-cert.sh"), certificateDirectory], {
		cwd: repositoryDirectory,
	});
}

function measurements(output: BenchmarkOutput): CollectedData {
	const data: Array<{
		name: string;
		value: number;
		units?: string;
		type?: ValueType;
		significance?: "Primary" | "Secondary" | "Diagnostic";
	}> = [
		{
			name: "Operations per second",
			value: output.aggregates.operationsPerSecond.mean,
			units: "operations/s",
			type: ValueType.LargerIsBetter,
			significance: "Primary",
		},
		{
			name: "Startup",
			value: output.aggregates.startupMilliseconds.mean,
			units: "ms",
			type: ValueType.SmallerIsBetter,
			significance: "Secondary",
		},
		{
			name: "Submission",
			value: output.aggregates.submissionMilliseconds.mean,
			units: "ms",
			type: ValueType.SmallerIsBetter,
			significance: "Secondary",
		},
		{
			name: "Convergence",
			value: output.aggregates.convergenceMilliseconds.mean,
			units: "ms",
			type: ValueType.SmallerIsBetter,
			significance: "Secondary",
		},
	];
	const serviceProcess = output.environment.serviceProcess;
	if (serviceProcess !== null) {
		data.push(
			{
				name: "Service CPU",
				value: serviceProcess.cpuSeconds,
				units: "s",
				significance: "Diagnostic",
			},
			{
				name: "Service peak RSS",
				value: serviceProcess.peakResidentSetKiB * 1024,
				units: "bytes",
				significance: "Diagnostic",
			},
		);
	}
	return data as unknown as CollectedData;
}

function parseOutput(stdout: string): BenchmarkOutput {
	const start = stdout.indexOf("{");
	if (start === -1) {
		throw new Error(`benchmark runner produced no JSON output:\n${stdout}`);
	}
	const output = JSON.parse(stdout.slice(start)) as Partial<BenchmarkOutput>;
	if (
		output.status !== "passed" ||
		output.aggregates === undefined ||
		output.samples === undefined
	) {
		throw new Error(`benchmark runner produced invalid evidence:\n${stdout}`);
	}
	return output as BenchmarkOutput;
}

function profilePathForCase(slug: string): string | undefined {
	const configuredPath = process.env.BENCHMARK_CPU_PROFILE_PATH;
	if (configuredPath === undefined) {
		return undefined;
	}
	const parsed = path.parse(path.resolve(packageDirectory, configuredPath));
	return path.join(parsed.dir, `${parsed.name}-${slug}${parsed.ext || ".cpuprofile"}`);
}

function run(
	command: string,
	argumentsList: readonly string[],
	options: { readonly cwd: string },
): void {
	try {
		execFileSync(command, argumentsList, { ...options, stdio: "pipe" });
	} catch (error) {
		const output = error as { stdout?: Buffer; stderr?: Buffer };
		throw new Error(
			`${command} ${argumentsList.join(" ")} failed:\n${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`,
			{ cause: error },
		);
	}
}

function waitForOutput(
	child: ChildProcess,
	pattern: RegExp,
	timeoutMilliseconds: number,
): Promise<RegExpMatchArray> {
	return new Promise((resolve, reject) => {
		let output = "";
		let errors = "";
		const timeout = setTimeout(
			() => finish(new Error(`timed out waiting for service:\n${output}\n${errors}`)),
			timeoutMilliseconds,
		);
		const finish = (error?: Error, match?: RegExpMatchArray): void => {
			clearTimeout(timeout);
			child.stdout?.off("data", onOutput);
			child.stderr?.off("data", onError);
			child.off("exit", onExit);
			error === undefined
				? resolve(match ?? fail("missing service output match"))
				: reject(error);
		};
		const onOutput = (chunk: Buffer): void => {
			output += chunk.toString();
			const match = output.match(pattern);
			if (match !== null) {
				finish(undefined, match);
			}
		};
		const onError = (chunk: Buffer): void => {
			errors += chunk.toString();
		};
		const onExit = (code: number | null, signal: NodeJS.Signals | null): void =>
			finish(
				new Error(`service exited before startup (${code ?? signal}):\n${output}\n${errors}`),
			);
		child.stdout?.on("data", onOutput);
		child.stderr?.on("data", onError);
		child.once("exit", onExit);
	});
}

async function waitForPort(
	child: ChildProcess,
	port: number,
	timeoutMilliseconds: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMilliseconds;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`Tinylicious exited before listening with code ${child.exitCode}`);
		}
		if (await canConnect(port)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`timed out waiting for Tinylicious on port ${port}`);
}

function canConnect(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		let finished = false;
		const finish = (value: boolean): void => {
			if (finished) {
				return;
			}
			finished = true;
			socket.destroy();
			resolve(value);
		};
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
		setTimeout(() => finish(false), 250);
	});
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				server.close();
				reject(new Error("failed to allocate a TCP port"));
				return;
			}
			server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
		});
	});
}

async function stopProcess(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	const exit = new Promise<boolean>((resolve) => child.once("exit", () => resolve(true)));
	child.kill("SIGTERM");
	const exited = await Promise.race([
		exit,
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
	]);
	if (!exited) {
		child.kill("SIGKILL");
		await exit;
	}
}

function positiveInteger(name: string, fallback: number): number {
	const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

function optionalPositiveInteger(name: string): number | undefined {
	return process.env[name] === undefined ? undefined : positiveInteger(name, 1);
}

function nonnegativeInteger(name: string, fallback: number): number {
	const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative integer`);
	}
	return value;
}

function booleanEnvironmentVariable(name: string): boolean | undefined {
	const value = process.env[name];
	if (value === undefined) {
		return undefined;
	}
	if (value === "1" || value.toLowerCase() === "true") {
		return true;
	}
	if (value === "0" || value.toLowerCase() === "false") {
		return false;
	}
	throw new Error(`${name} must be 0, 1, true, or false`);
}

function fail(message: string): never {
	throw new Error(message);
}
