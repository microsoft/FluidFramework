// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// eslint-disable-next-line unicorn/prefer-module
const testDirectory = __dirname;
const helperPath = resolve(testDirectory, "../../../pipelines/scripts/frsBenchmarkRetryHelper.mjs");
const wrapperPath = resolve(
	testDirectory,
	"../../../pipelines/scripts/run-frs-benchmark-with-retries.sh",
);
const bashPath =
	process.platform === "win32"
		? [
				"C:\\Program Files\\Git\\bin\\bash.exe",
				"C:\\Program Files\\Git\\usr\\bin\\bash.exe",
		  ].find((path) => existsSync(path)) ?? "bash"
		: "bash";
const sandboxes: string[] = [];

interface ScenarioAttempt {
	readonly blockAttemptLog?: boolean;
	readonly blockCombinedLog?: boolean;
	readonly report?: unknown;
	readonly status: number;
	readonly stderr?: readonly string[];
	readonly stdout?: readonly string[];
}

interface Scenario {
	readonly attempts: readonly ScenarioAttempt[];
}

interface RunOptions {
	readonly blockCanonicalParent?: boolean;
	readonly maxAttempts?: number;
	readonly name?: string;
}

interface HelperAnalysis {
	readonly classification: {
		readonly classes: readonly { readonly displayName: string; readonly name: string }[];
		readonly isExactlyOneAllowedClass: boolean;
		readonly unknownEvidence: readonly string[];
	};
	readonly report: { readonly valid: boolean };
}

const validReport = [
	{
		suiteName: "Suite",
		contents: [
			{
				benchmarkName: "benchmark",
				data: [
					{
						name: "duration",
						value: 1,
						units: "ms",
						type: "SmallerIsBetter",
						significance: "Primary",
					},
				],
			},
		],
	},
];

afterEach(() => {
	for (const sandbox of sandboxes.splice(0)) {
		rmSync(sandbox, { recursive: true, force: true });
	}
});

function createSandbox(name: string) {
	const sandbox = mkdtempSync(join(testDirectory, `.frs-benchmark-retry-${name}-`));
	sandboxes.push(sandbox);
	return sandbox;
}

function writeFakeChild(sandbox: string, scenario: Scenario) {
	const scenarioPath = join(sandbox, "scenario.json");
	const childPath = join(sandbox, "fake-child.mjs");
	writeFileSync(scenarioPath, JSON.stringify(scenario), "utf8");
	writeFileSync(
		childPath,
		[
			'import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";',
			'import { dirname, join } from "node:path";',
			"",
			'const scenario = JSON.parse(readFileSync(process.env.FRS_BENCHMARK_RETRY_SCENARIO, "utf8"));',
			"const attempt = Number(process.env.FRS_BENCHMARK_ATTEMPT);",
			"const step = scenario.attempts[Math.min(attempt - 1, scenario.attempts.length - 1)];",
			"if (step.blockAttemptLog) {",
			"\tconst attemptLog = join(",
			"\t\tdirname(process.env.FRS_BENCHMARK_REPORT_FILE),",
			"\t\t`attempt-${attempt}.log`,",
			"\t);",
			"\trmSync(attemptLog, { force: true, recursive: true });",
			"\tmkdirSync(attemptLog);",
			"}",
			"for (const line of step.stdout ?? []) {",
			"\tprocess.stdout.write(`${line}\\n`);",
			"}",
			"for (const line of step.stderr ?? []) {",
			"\tprocess.stderr.write(`${line}\\n`);",
			"}",
			'if (Object.hasOwn(step, "report")) {',
			"\twriteFileSync(",
			"\t\tprocess.env.FRS_BENCHMARK_REPORT_FILE,",
			'\t\ttypeof step.report === "string" ? step.report : JSON.stringify(step.report),',
			"\t);",
			"}",
			"if (step.blockCombinedLog) {",
			'\tconst combinedLog = join(dirname(process.env.FRS_BENCHMARK_REPORT_FILE), "combined.log");',
			"\trmSync(combinedLog, { force: true, recursive: true });",
			"\tmkdirSync(combinedLog);",
			"}",
			"process.exit(step.status);",
			"",
		].join("\n"),
		"utf8",
	);
	return { childPath, scenarioPath };
}

function runWrapper(scenario: Scenario, options: RunOptions = {}) {
	const sandbox = createSandbox(options.name ?? "case");
	const { childPath, scenarioPath } = writeFakeChild(sandbox, scenario);
	if (options.blockCanonicalParent === true) {
		writeFileSync(join(sandbox, "blocked-parent"), "not a directory", "utf8");
	}
	const canonicalReport =
		options.blockCanonicalParent === true
			? join(sandbox, "blocked-parent", "benchmarkFrsOutput.json")
			: join(sandbox, "benchmarkFrsOutput.json");
	const args = [
		wrapperPath,
		"--report-file",
		canonicalReport,
		...(options.maxAttempts === undefined
			? []
			: ["--max-attempts", String(options.maxAttempts)]),
		"--",
		"node",
		childPath,
	];
	const result = spawnSync(bashPath, args, {
		cwd: sandbox,
		encoding: "utf8",
		env: { ...process.env, FRS_BENCHMARK_RETRY_SCENARIO: scenarioPath },
	});
	return {
		...result,
		sandbox,
		canonicalReport,
		output: `${result.stdout}${result.stderr}`,
	};
}

function assertNoPrivateArtifacts(sandbox: string) {
	assert(!readdirSync(sandbox).some((name) => name.startsWith(".frs-benchmark-retry-private-")));
}

function runHelper(args: string[], sandboxName: string) {
	const sandbox = createSandbox(sandboxName);
	const result = spawnSync("node", [helperPath, ...args], {
		cwd: sandbox,
		encoding: "utf8",
	});
	return { ...result, sandbox, output: `${result.stdout}${result.stderr}` };
}

function analyze(logText: string, report: unknown, status = 1): HelperAnalysis {
	const sandbox = createSandbox("analyze");
	const logPath = join(sandbox, "attempt.log");
	const reportPath = join(sandbox, "attempt-report.json");
	writeFileSync(logPath, logText, "utf8");
	writeFileSync(reportPath, typeof report === "string" ? report : JSON.stringify(report), "utf8");
	const result = spawnSync(
		"node",
		[
			helperPath,
			"analyze",
			"--status",
			String(status),
			"--log",
			logPath,
			"--report",
			reportPath,
		],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
	return JSON.parse(result.stdout) as HelperAnalysis;
}

describe("FRS benchmark retry helper", () => {
	it("classifies only exact allowlisted FRS transient signatures", () => {
		assert.equal(
			analyze(
				"Error: HTTP 503 upstream connection terminated before response headers",
				validReport,
			).classification.classes[0].name,
			"upstream-connection-terminated-before-response-headers",
		);
		assert.equal(
			analyze("Error: HTTP 504 from Azure Front Door OriginTimeout", validReport)
				.classification.classes[0].name,
			"azure-front-door-origin-timeout",
		);
		const statusOnly = analyze("Error: HTTP 503 Service Unavailable", validReport);
		assert.equal(statusOnly.classification.classes.length, 0);
		assert.equal(statusOnly.classification.unknownEvidence.length, 1);
	});

	it("strips ANSI before classifying and neutralizes live ADO commands", () => {
		const classified = analyze(
			"\u001B[31mError: HTTP 503 upstream connection terminated before response headers\u001B[0m",
			validReport,
		);
		assert.equal(classified.classification.isExactlyOneAllowedClass, true);
		assert.equal(
			runHelper(
				["sanitize-line", "--line", "before ##vso[task.complete result=Failed;] after"],
				"sanitize-line",
			).stdout.trim(),
			"before ## vso[task.complete result=Failed;] after",
		);
	});

	it("validates recursive ReportArray, ReportSuite, and ReportEntry data", () => {
		assert.equal(analyze("", validReport, 0).report.valid, true);
		assert.equal(
			analyze(
				"",
				[
					{
						benchmarkName: "nan benchmark",
						data: [
							{
								name: "duration",
								value: Number.NaN,
								units: "ms",
								type: "SmallerIsBetter",
								significance: "Primary",
							},
						],
					},
				],
				0,
			).report.valid,
			true,
		);
		assert.equal(analyze("", [], 0).report.valid, false);
		assert.equal(analyze("", [{ suiteName: "empty", contents: [] }], 0).report.valid, false);
		assert.equal(
			analyze("", [{ benchmarkName: "bad", data: [{ name: "duration", value: 1 }] }]).report
				.valid,
			false,
		);
		assert.equal(
			analyze("", [
				{
					suiteName: "s",
					contents: [{ benchmarkName: "b", data: { error: "x" } }],
				},
			]).report.valid,
			false,
		);
		assert.equal(
			analyze("", [
				{
					suiteName: "s",
					contents: [
						{
							benchmarkName: "bad",
							data: [
								{
									name: "duration",
									value: "1",
									units: "ms",
									type: "SmallerIsBetter",
									significance: "Primary",
								},
							],
						},
					],
				},
			]).report.valid,
			false,
		);
	});
});

describe("FRS benchmark retry wrapper", function () {
	this.timeout(30_000);

	it("downgrades one allowlisted transient class with a valid final report", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: validReport,
					},
				],
			},
			{ maxAttempts: 1, name: "eligible" },
		);

		assert.equal(result.status, 0, result.output);
		assert.match(result.output, /##vso\[task.logissue type=warning]/);
		assert.match(result.output, /##vso\[task.complete result=SucceededWithIssues;]/);
		assert.deepEqual(JSON.parse(readFileSync(result.canonicalReport, "utf8")), validReport);
		assertNoPrivateArtifacts(result.sandbox);
	});

	it("uses no more than three total attempts", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: validReport,
					},
				],
			},
			{ name: "max" },
		);

		assert.equal(result.status, 0, result.output);
		assert.match(result.output, /Starting FRS benchmark attempt 1 of 3/);
		assert.match(result.output, /Starting FRS benchmark attempt 2 of 3/);
		assert.match(result.output, /Starting FRS benchmark attempt 3 of 3/);
		assert.doesNotMatch(result.output, /Starting FRS benchmark attempt 4/);
	});

	it("rejects unknown extra failure evidence", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
							"Error: unexpected benchmark failure",
						],
						report: validReport,
					},
				],
			},
			{ maxAttempts: 1, name: "unknown" },
		);

		assert.equal(result.status, 1, result.output);
		assert.doesNotMatch(result.output, /SucceededWithIssues/);
	});

	it("rejects mixed allowlisted transient classes across attempts", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: validReport,
					},
					{
						status: 2,
						stderr: ["Error: HTTP 504 from Azure Front Door OriginTimeout"],
						report: validReport,
					},
				],
			},
			{ maxAttempts: 2, name: "mixed" },
		);

		assert.equal(result.status, 2, result.output);
		assert.doesNotMatch(result.output, /SucceededWithIssues/);
	});

	it("rejects assertion failures and benchmark report error entries", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
							"AssertionError [ERR_ASSERTION]: expected true",
						],
						report: [
							{
								benchmarkName: "benchmark",
								data: { error: "assertion failed" },
							},
						],
					},
				],
			},
			{ maxAttempts: 1, name: "assertion" },
		);

		assert.equal(result.status, 1, result.output);
		assert.equal(existsSync(result.canonicalReport), false);
	});

	it("rejects status-code-only failures", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: ["Error: HTTP 503 Service Unavailable"],
						report: validReport,
					},
				],
			},
			{ maxAttempts: 1, name: "status-code-only" },
		);

		assert.equal(result.status, 1, result.output);
		assert.doesNotMatch(result.output, /SucceededWithIssues/);
	});

	it("neutralizes child VSO commands in the live stream", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 0,
						stdout: ["##vso[task.complete result=Failed;]malicious child command"],
						report: validReport,
					},
				],
			},
			{ name: "sanitize" },
		);

		assert.equal(result.status, 0, result.output);
		assert.match(result.output, /## vso\[task.complete result=Failed;]/);
		assert.doesNotMatch(result.output, /##vso\[task.complete result=Failed;]malicious/);
	});

	it("fails closed on malformed, empty, and entryless reports", () => {
		const cases: [string, unknown][] = [
			["malformed", "{"],
			["empty", []],
			["entryless", [{ suiteName: "s", contents: [] }]],
		];
		for (const [name, report] of cases) {
			const result = runWrapper(
				{
					attempts: [
						{
							status: 1,
							stderr: [
								"Error: HTTP 503 upstream connection terminated before response headers",
							],
							report,
						},
					],
				},
				{ maxAttempts: 1, name },
			);
			assert.equal(result.status, 1, `${name}: ${result.output}`);
			assert.equal(existsSync(result.canonicalReport), false);
		}
	});

	it("fails closed on malformed leaf data and recursive error properties", () => {
		const cases: [string, unknown][] = [
			[
				"malformed-leaf",
				[
					{
						benchmarkName: "benchmark",
						data: [{ name: "duration", value: 1 }],
					},
				],
			],
			[
				"recursive-error",
				[
					{
						suiteName: "s",
						contents: [
							{
								benchmarkName: "benchmark",
								data: [
									{
										name: "duration",
										value: 1,
										units: "ms",
										type: "SmallerIsBetter",
										significance: "Primary",
										error: "nested error",
									},
								],
							},
						],
					},
				],
			],
		];
		for (const [name, report] of cases) {
			const result = runWrapper(
				{
					attempts: [
						{
							status: 1,
							stderr: [
								"Error: HTTP 503 upstream connection terminated before response headers",
							],
							report,
						},
					],
				},
				{ maxAttempts: 1, name },
			);
			assert.equal(result.status, 1, `${name}: ${result.output}`);
			assert.equal(existsSync(result.canonicalReport), false);
		}
	});

	it("copies only the selected final valid report to the canonical path", () => {
		const firstReport = [
			{
				benchmarkName: "first",
				data: [
					{
						name: "duration",
						value: 1,
						units: "ms",
						type: "SmallerIsBetter",
						significance: "Primary",
					},
				],
			},
		];
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: firstReport,
					},
					{
						status: 0,
						stdout: ["ordinary informational output"],
						report: validReport,
					},
				],
			},
			{ maxAttempts: 3, name: "canonical" },
		);

		assert.equal(result.status, 0, result.output);
		assert.deepEqual(JSON.parse(readFileSync(result.canonicalReport, "utf8")), validReport);
		assertNoPrivateArtifacts(result.sandbox);
		assert.equal(
			readdirSync(result.sandbox).filter((name) => /^benchmark.*Output\.json$/u.test(name))
				.length,
			1,
		);
	});

	it("fails nonzero when the canonical report cannot be created on success", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 0,
						stdout: ["ordinary informational output"],
						report: validReport,
					},
				],
			},
			{ blockCanonicalParent: true, name: "copy-failure-success" },
		);

		assert.equal(result.status, 1, result.output);
		assert.match(result.output, /Unable to (create canonical|preserve) FRS benchmark report/);
		assert.doesNotMatch(result.output, /FRS benchmark attempt 1 succeeded/);
	});

	it("fails nonzero when the canonical report cannot be created on downgrade", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 1,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: validReport,
					},
				],
			},
			{
				blockCanonicalParent: true,
				maxAttempts: 1,
				name: "copy-failure-downgrade",
			},
		);

		assert.equal(result.status, 1, result.output);
		assert.match(result.output, /Unable to (create canonical|preserve) FRS benchmark report/);
		assert.doesNotMatch(result.output, /SucceededWithIssues/);
	});

	it("fails nonzero when appending an attempt log fails", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						blockCombinedLog: true,
						status: 0,
						stdout: ["ordinary informational output"],
						report: validReport,
					},
				],
			},
			{ name: "log-append-failure" },
		);

		assert.equal(result.status, 1, result.output);
		assert.match(result.output, /Unable to append FRS benchmark attempt log/);
		assert.doesNotMatch(result.output, /FRS benchmark attempt 1 succeeded/);
	});

	it("fails nonzero when writing an attempt log fails", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						blockAttemptLog: true,
						status: 0,
						stdout: ["ordinary informational output"],
						report: validReport,
					},
				],
			},
			{ name: "attempt-log-write-failure" },
		);

		assert.equal(result.status, 1, result.output);
		assert.match(result.output, /Unable to write FRS benchmark attempt log/);
		assert.doesNotMatch(result.output, /FRS benchmark attempt 1 succeeded/);
	});

	it("fails closed on zero-status anomaly", () => {
		const result = runWrapper(
			{
				attempts: [
					{
						status: 0,
						stderr: [
							"Error: HTTP 503 upstream connection terminated before response headers",
						],
						report: validReport,
					},
				],
			},
			{ name: "zero-status" },
		);

		assert.equal(result.status, 1, result.output);
		assert.equal(existsSync(result.canonicalReport), false);
	});
});
