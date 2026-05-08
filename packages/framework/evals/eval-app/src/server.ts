/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-console -- Server output is intentional */

import * as fs from "node:fs";
import * as http from "node:http";
import { createRequire } from "node:module";
import * as path from "node:path";

import {
	EvalFramework,
	type DimensionAggregate,
	type EvaluationResult,
	type Logger,
	type ScenarioArtifact,
} from "@fluidframework/eval-framework";
import {
	DEFAULT_SCALE,
	formatError,
	getDatasetDirectoryName,
	updateManualResultFiles,
	writeResultsToDirectory,
	type DatasetEvalResultInternal,
	type ScenarioEvalResultInternal,
} from "@fluidframework/eval-framework/internal";

import {
	findScenarioDirName,
	readDatasetSummaries,
	readScenarioSummary,
	listRuns,
	listManualRuns,
} from "./dataReaders.js";
import { pkgName } from "./packageVersion.js";
import type { EvalServerConfig, ProgressReporter } from "./types.js";

const require = createRequire(import.meta.url);
// Use an absolute package specifier (not a relative path) so this resolves correctly
// even when the consuming app bundles this code into its own output with esbuild.
const evalAppPackageRoot = path.dirname(require.resolve(`${pkgName}/package.json`));

// ── Helpers ──────────────────────────────────────────────────────────

/** Send a JSON response. */
function sendJson(res: http.ServerResponse, data: unknown, status = 200): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

/** Read the full request body as a string. */
async function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => resolve(body));
	});
}

/**
 * Serve a static file, restricted to files within `rootDir`.
 * Returns true if the file was served (or an error response was sent), false if the path didn't match.
 */
function serveStaticFile(
	res: http.ServerResponse,
	rootDir: string,
	relativePath: string,
): void {
	const resolved = path.resolve(path.join(rootDir, relativePath));
	const relative = path.relative(path.resolve(rootDir), resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	if (!fs.existsSync(resolved)) {
		res.writeHead(404);
		res.end("Not found");
		return;
	}

	const ext = path.extname(resolved);
	const contentTypes: Record<string, string> = {
		".json": "application/json",
		".md": "text/markdown",
		".png": "image/png",
		".html": "text/html",
	};

	res.writeHead(200, { "Content-Type": contentTypes[ext] ?? "application/octet-stream" });
	const stream = fs.createReadStream(resolved);
	stream.on("error", () => {
		res.writeHead(500);
		res.end("Internal server error");
	});
	stream.pipe(res);
}

/** Begin an SSE response and return an event sender. */
function beginSSE(res: http.ServerResponse): (event: string, data: unknown) => void {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	return (event: string, data: unknown): void => {
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	};
}

/** Create a {@link ProgressReporter} that sends SSE events. */
function createProgressReporter(
	sendEvent: (event: string, data: unknown) => void,
): ProgressReporter {
	return {
		progress(message: string): void {
			sendEvent("progress", { message });
		},
		warn(message: string): void {
			sendEvent("progress", { message: `[stderr] ${message}` });
		},
	};
}

/** Create a {@link Logger} that forwards messages to a {@link ProgressReporter}. */
function createLogger(progress: ProgressReporter): Logger {
	return {
		info: (msg) => progress.progress(`[INFO] ${msg}`),
		warn: (msg) => progress.warn(`[WARN] ${msg}`),
		error: (msg) => progress.warn(`[ERROR] ${msg}`),
		debug: (msg) => progress.progress(`[DEBUG] ${msg}`),
	};
}

// ── Data readers (imported from dataReaders.ts) ─────────────────────

interface DatasetInfo {
	file: string;
	name: string;
	description: string;
	scenarioCount: number;
}

function listOptions(datasetsDir: string): { datasets: DatasetInfo[] } {
	const datasetFiles = fs.existsSync(datasetsDir)
		? fs.readdirSync(datasetsDir).filter((f) => f.endsWith(".json"))
		: [];
	const datasets = datasetFiles.map((file) => {
		try {
			const content = JSON.parse(fs.readFileSync(path.join(datasetsDir, file), "utf8"));
			return {
				file,
				name: content.name ?? file,
				description: content.metadata?.description ?? "",
				scenarioCount: content.datasets?.length ?? 0,
			};
		} catch {
			return { file, name: file, description: "", scenarioCount: 0 };
		}
	});
	return { datasets };
}

// ── Manual run helpers ───────────────────────────────────────────────

interface HumanScoreEntry {
	score: number | undefined;
	reasoning: string;
}
type HumanScores = Record<string, Record<string, HumanScoreEntry>>;

/**
 * Build a {@link ScenarioEvalResultInternal} from a scenario artifact and optional human scores.
 * When no scores are provided all rubric scores are undefined (used for the initial write after generation).
 */
function buildManualRunResult(
	scenario: ScenarioArtifact,
	timestamp: string,
	humanScores?: HumanScores,
): ScenarioEvalResultInternal {
	const rubrics = scenario.llmEvalConfig.rubrics;
	const scale = scenario.llmEvalConfig.defaultScale ?? DEFAULT_SCALE;

	const datasetResults: DatasetEvalResultInternal[] = scenario.datasetArtifacts.map((ds) => {
		const dsScores = humanScores?.[ds.name] ?? {};
		const evalResult: EvaluationResult[] = rubrics.map((rubric) => {
			const entry: HumanScoreEntry | undefined = dsScores[rubric.name];
			return {
				rubricName: rubric.name,
				score: entry?.score,
				reasoning: entry?.reasoning ?? "",
				executionTimeMs: 0,
			};
		});
		const nonNull = evalResult
			.filter((r) => r.score !== undefined)
			.map((r) => r.score as number);
		const dsAverageScore =
			nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : 0;
		return {
			name: ds.name,
			appMetadata: (ds.metadata as Record<string, unknown>) ?? {},
			evalResult,
			resultMetadata: {
				averageScore: dsAverageScore,
				executionTimeMs: 0,
				timestamp,
				generatorModel: scenario.modelType ?? "",
				judgeModel: "Human",
			},
			input: ds.input,
			output: ds.output,
			images: ds.images,
		};
	});

	// Scenario-level aggregates
	const allEval = datasetResults.flatMap((ds) => ds.evalResult);
	const rubricDimensionAggregates: Record<string, DimensionAggregate> = {};
	for (const rubric of rubrics) {
		const scores = allEval
			.filter((r) => r.rubricName === rubric.name && r.score !== undefined)
			.map((r) => r.score as number);
		rubricDimensionAggregates[rubric.name] = {
			average:
				scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
			count: scores.length,
			min: scores.length > 0 ? Math.min(...scores) : undefined,
			max: scores.length > 0 ? Math.max(...scores) : undefined,
		};
	}
	const allScores = allEval.filter((r) => r.score !== undefined).map((r) => r.score as number);
	const totalPoints = allScores.reduce((a, b) => a + b, 0);
	const maxPossiblePoints = datasetResults.length * rubrics.length * scale.max;
	const overallPercentage =
		maxPossiblePoints > 0 ? Math.round((totalPoints / maxPossiblePoints) * 100) : 0;
	const status: "GOOD" | "PASS" | "NEEDS_IMPROVEMENT" =
		overallPercentage >= 80 ? "GOOD" : overallPercentage >= 60 ? "PASS" : "NEEDS_IMPROVEMENT";
	const averageScore =
		allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

	return {
		name: scenario.name,
		appMetadata: (scenario.metadata as Record<string, unknown>) ?? {},
		customResultProperties: scenario.customResultProperties,
		llmEvalConfig: scenario.llmEvalConfig,
		datasetResults,
		resultMetadata: {
			totalDatasets: datasetResults.length,
			averageScore,
			totalExecutionTimeMs: 0,
			generatorModel: scenario.modelType ?? "",
			judgeModel: "Human",
			timestamp,
			rubricDimensionAggregates,
			totalPoints,
			maxPossiblePoints,
			overallPercentage,
			status,
		},
	};
}

// ── Server ───────────────────────────────────────────────────────────

/**
 * Create a configured eval server.
 * @legacy
 * @alpha
 *
 * The server provides:
 * - Static UI (index.html + styles.css)
 * - `/api/config` — app name, default models, model options, auth availability
 * - `/api/options` — available datasets
 * - `/api/runs` — historical run listing
 * - `/api/run-eval` — triggers generation via the configured callback (SSE stream)
 * - `/api/stop-eval` — aborts a running eval
 * - `/api/auth-status` / `/api/auth` — optional auth flow
 * - `/api/results/` — serves result files
 * - `/api/datasets/` — serves dataset files
 * - `/api/upload-dataset` — uploads a custom dataset JSON
 */
export function createEvalServer(config: EvalServerConfig): http.Server {
	const { appName, datasetsDir, resultsDir } = config;
	const port = config.port ?? 8150;
	const hasAuth = Boolean(config.checkAuth);

	/** Track the currently running eval so it can be stopped. */
	let activeAbortController: AbortController | undefined;

	/** Resolve a UI asset path relative to the installed package root. */
	function resolveUIAsset(filename: string): string {
		return path.join(evalAppPackageRoot, filename);
	}

	/**
	 * Parse and normalise the `customGenerationProperties` field from a run request body.
	 * Returns undefined when the field is absent or empty.
	 */
	function parseCustomGenerationProperties(
		params: Record<string, unknown>,
	): Record<string, boolean | string | number> | undefined {
		const raw = params.customGenerationProperties as
			| Record<string, boolean | string | number>
			| undefined;
		return raw && Object.keys(raw).length > 0 ? raw : undefined;
	}

	/**
	 * Merge `customGenerationProperties` into `scenario.customResultProperties` so they are
	 * persisted to disk and appear in the results table with filtering.
	 * scenario-level properties take precedence over generation-level ones.
	 */
	function mergeCustomGenerationProperties(
		scenario: { customResultProperties?: Record<string, boolean | string | number> },
		customGenerationProperties: Record<string, boolean | string | number> | undefined,
	): void {
		if (!customGenerationProperties) return;
		scenario.customResultProperties = {
			...customGenerationProperties,
			...scenario.customResultProperties,
		};
	}

	/**
	 * Begin an SSE run response, register an AbortController, invoke `fn`, and handle teardown.
	 * `fn` receives (sendEvent, progress, signal) and should resolve when the run is done.
	 * Errors and abort are caught here and forwarded as SSE error events.
	 */
	function startRun(
		res: http.ServerResponse,
		abortedMessage: string,
		fn: (
			sendEvent: (event: string, data: unknown) => void,
			progress: ProgressReporter,
			signal: AbortSignal,
		) => Promise<void>,
	): void {
		const sendEvent = beginSSE(res);
		const progress = createProgressReporter(sendEvent);
		const abortController = new AbortController();
		activeAbortController = abortController;
		fn(sendEvent, progress, abortController.signal).catch((error) => {
			activeAbortController = undefined;
			const message = abortController.signal.aborted ? abortedMessage : formatError(error);
			sendEvent("error", { message });
			res.end();
		});
	}

	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://localhost:${port}`);

		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		// Serve the UI
		if (
			url.pathname === "/" ||
			url.pathname === "/index.html" ||
			url.pathname === "/results"
		) {
			res.writeHead(200, { "Content-Type": "text/html" });
			fs.createReadStream(resolveUIAsset("index.html")).pipe(res);
			return;
		}

		// Serve the stylesheet
		if (url.pathname === "/styles.css") {
			res.writeHead(200, { "Content-Type": "text/css" });
			fs.createReadStream(resolveUIAsset("styles.css")).pipe(res);
			return;
		}

		// API: app configuration (consumed by the UI to parameterize itself)
		if (url.pathname === "/api/config" && req.method === "GET") {
			sendJson(res, {
				appName,
				defaultGeneratorModel: config.defaultGeneratorModel,
				defaultJudgeModel: config.defaultJudgeModel,
				modelOptions: config.modelOptions,
				hasAuth,
				customGenerationProperties: config.customGenerationProperties ?? {},
			});
			return;
		}

		// API: check auth status
		if (url.pathname === "/api/auth-status" && req.method === "GET") {
			if (!config.checkAuth) {
				sendJson(res, { authenticated: true });
				return;
			}
			config
				.checkAuth()
				.then((authenticated) => sendJson(res, { authenticated }))
				.catch(() => sendJson(res, { authenticated: false }));
			return;
		}

		// API: trigger interactive auth
		if (url.pathname === "/api/auth" && req.method === "POST") {
			if (!config.runAuth) {
				res.writeHead(404);
				res.end("Auth not configured");
				return;
			}

			const sendEvent = beginSSE(res);
			const progress = createProgressReporter(sendEvent);

			config
				.runAuth(progress)
				.then(() => {
					sendEvent("complete", { message: "Authentication successful!" });
					res.end();
				})
				.catch((error) => {
					sendEvent("error", {
						message: error instanceof Error ? error.message : String(error),
					});
					res.end();
				});
			return;
		}

		// API: list available options
		if (url.pathname === "/api/options" && req.method === "GET") {
			sendJson(res, listOptions(datasetsDir));
			return;
		}

		// API: list previous runs
		if (url.pathname === "/api/runs" && req.method === "GET") {
			sendJson(res, listRuns(resultsDir));
			return;
		}

		// API: get summaries for a specific eval run
		if (/^\/api\/runs\/[^/]+\/summaries$/.test(url.pathname) && req.method === "GET") {
			const runName = url.pathname.split("/")[3];
			const runDir = path.join(resultsDir, runName);
			sendJson(res, {
				runName,
				scenarioDirName: findScenarioDirName(runDir) ?? undefined,
				datasetSummaries: readDatasetSummaries(runDir),
			});
			return;
		}

		// API: get scenario-level summary for a specific eval run
		if (/^\/api\/runs\/[^/]+\/scenario-summary$/.test(url.pathname) && req.method === "GET") {
			const runName = url.pathname.split("/")[3];
			const runDir = path.join(resultsDir, runName);
			sendJson(res, {
				runName,
				scenarioDirName: findScenarioDirName(runDir) ?? undefined,
				markdown: readScenarioSummary(runDir) ?? "",
			});
			return;
		}

		// API: get summaries for a specific manual run
		if (/^\/api\/manual-runs\/[^/]+\/summaries$/.test(url.pathname) && req.method === "GET") {
			const runName = url.pathname.split("/")[3];
			const sanitizedRunName = path.basename(runName);
			const runDir = path.join(resultsDir, "manual", sanitizedRunName);
			sendJson(res, {
				runName: sanitizedRunName,
				datasetSummaries: readDatasetSummaries(runDir),
			});
			return;
		}

		// API: get scenario-level summary for a specific manual run
		if (
			/^\/api\/manual-runs\/[^/]+\/scenario-summary$/.test(url.pathname) &&
			req.method === "GET"
		) {
			const runName = url.pathname.split("/")[3];
			const sanitizedRunName = path.basename(runName);
			const runDir = path.join(resultsDir, "manual", sanitizedRunName);
			sendJson(res, {
				runName: sanitizedRunName,
				markdown: readScenarioSummary(runDir) ?? "",
			});
			return;
		}

		// API: get rubrics, datasets, and existing scores for a manual run (used for re-scoring)
		if (
			/^\/api\/manual-runs\/[^/]+\/scoring-info$/.test(url.pathname) &&
			req.method === "GET"
		) {
			const runName = url.pathname.split("/")[3];
			const sanitizedRunName = path.basename(runName);
			const runDir = path.join(resultsDir, "manual", sanitizedRunName);
			const resolvedRunDir = path.resolve(runDir);
			const manualDir = path.resolve(path.join(resultsDir, "manual"));
			if (!resolvedRunDir.startsWith(manualDir + path.sep)) {
				sendJson(res, { error: "Invalid run name" }, 400);
				return;
			}
			try {
				const resultFile = path.join(runDir, "result.json");
				const llmEvalConfigFile = path.join(runDir, "llmEvalConfig.json");
				if (!fs.existsSync(resultFile) || !fs.existsSync(llmEvalConfigFile)) {
					sendJson(res, { error: "Manual run not found" }, 404);
					return;
				}
				const scenarioResult = JSON.parse(fs.readFileSync(resultFile, "utf8"));
				const llmEvalConfig = JSON.parse(fs.readFileSync(llmEvalConfigFile, "utf8"));
				const datasetDirs = fs
					.readdirSync(runDir)
					.filter(
						(d) => d.startsWith("dataset-") && fs.statSync(path.join(runDir, d)).isDirectory(),
					)
					.sort();
				const datasets: { name: string; dirName: string; imageUrls: string[] }[] = [];
				const existingScores: Record<
					string,
					Record<string, { score: number | undefined; reasoning: string }>
				> = {};
				for (const dirName of datasetDirs) {
					const datasetDir = path.join(runDir, dirName);
					const dsResult = JSON.parse(
						fs.readFileSync(path.join(datasetDir, "result.json"), "utf8"),
					);
					const imageUrls = fs
						.readdirSync(datasetDir)
						.filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
						.map((f) => `/api/results/manual/${sanitizedRunName}/${dirName}/${f}`);
					datasets.push({ name: dsResult.name, dirName, imageUrls });
					const dsScores: Record<string, { score: number | undefined; reasoning: string }> =
						{};
					existingScores[dsResult.name] = dsScores;
					for (const evalEntry of dsResult.evalResult ?? []) {
						dsScores[evalEntry.rubricName] = {
							score: evalEntry.score,
							reasoning: evalEntry.reasoning ?? "",
						};
					}
				}
				sendJson(res, {
					scenarioName: scenarioResult.name,
					rubrics: llmEvalConfig.rubrics,
					scale: llmEvalConfig.defaultScale ?? DEFAULT_SCALE,
					datasets,
					existingScores,
				});
			} catch (error) {
				sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 500);
			}
			return;
		}

		// API: upload a custom dataset JSON
		if (url.pathname === "/api/upload-dataset" && req.method === "POST") {
			readBody(req).then((body) => {
				try {
					const parsed = JSON.parse(body);
					if (!parsed.datasets || !Array.isArray(parsed.datasets)) {
						sendJson(res, { error: 'Invalid dataset: must contain a "datasets" array' }, 400);
						return;
					}
					const fileName = `custom_${Date.now()}.json`;
					fs.writeFileSync(
						path.join(datasetsDir, fileName),
						JSON.stringify(parsed, undefined, 2),
					);
					sendJson(res, { file: fileName });
				} catch (error) {
					sendJson(
						res,
						{
							error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
						},
						400,
					);
				}
			});
			return;
		}

		// API: run generation + evaluation via the configured callbacks
		if (url.pathname === "/api/run-eval" && req.method === "POST") {
			readBody(req).then((body) => {
				const params = JSON.parse(body);
				const dataset: string = params.dataset ?? "";
				const model: string = params.model ?? config.defaultGeneratorModel;
				const judgeModel: string = params.judgeModel ?? config.defaultJudgeModel;
				const customGenerationProperties = parseCustomGenerationProperties(params);

				startRun(res, "Eval run stopped by user", async (sendEvent, progress, signal) => {
					sendEvent("progress", {
						message: `Running eval: dataset=${dataset}, model=${model}, judge=${judgeModel}`,
					});

					const generationResult = await config.runGeneration(
						{ dataset, model, judgeModel, customGenerationProperties },
						progress,
						signal,
					);
					signal.throwIfAborted();

					mergeCustomGenerationProperties(
						generationResult.scenario,
						customGenerationProperties,
					);

					sendEvent("progress", { message: "\n--- Evaluation ---" });
					sendEvent("progress", { message: `Judge model: ${judgeModel}` });

					const logger = createLogger(progress);
					const framework = new EvalFramework({
						judgeModel,
						logger,
						llmClient: generationResult.llmClient,
						customEvaluators: generationResult.customEvaluators,
					});
					const evalResult = await framework.run({
						scenario: generationResult.scenario,
						resultsDirPath: generationResult.resultsDirPath,
					});

					if (evalResult.resultDirPath === undefined) {
						sendEvent("error", { message: "Scenario result directory not found" });
						res.end();
						return;
					}
					sendEvent("progress", { message: "\n--- Results ---" });
					sendEvent("progress", {
						message: JSON.stringify(evalResult.resultMetadata, undefined, 2),
					});

					activeAbortController = undefined;
					// Detect layout: if resultDirPath is a direct child of resultsDir, it's flat
					// (the run dir IS the scenario dir). Otherwise it's nested.
					const isFlatLayout =
						path.dirname(evalResult.resultDirPath) === path.resolve(resultsDir);
					const scenarioDirName = isFlatLayout ? "" : path.basename(evalResult.resultDirPath);
					const outputDir = isFlatLayout
						? evalResult.resultDirPath
						: generationResult.resultsDirPath;
					const scenarioSummary = readScenarioSummary(evalResult.resultDirPath) ?? "";
					const datasetSummaries = evalResult.datasetResults
						.filter((ds) => ds.resultDirPath !== undefined)
						.map((ds) => {
							const summaryPath = path.join(ds.resultDirPath!, "summary.md");
							const markdown = fs.existsSync(summaryPath)
								? fs.readFileSync(summaryPath, "utf8")
								: "";
							return {
								datasetName: ds.name,
								dirName: path.basename(ds.resultDirPath!),
								markdown,
							};
						})
						.filter((ds) => ds.markdown !== "");
					sendEvent("complete", {
						outputDir,
						scenarioDirName,
						datasetSummaries,
						scenarioSummary,
					});
					res.end();
				});
			});
			return;
		}

		// API: run generation only (manual mode — no LLM eval)
		if (url.pathname === "/api/run-manual" && req.method === "POST") {
			readBody(req).then((body) => {
				let params;
				try {
					params = JSON.parse(body);
				} catch {
					sendJson(res, { error: "Invalid JSON" }, 400);
					return;
				}
				const dataset: string = params.dataset ?? "";
				const model: string = params.model ?? config.defaultGeneratorModel;
				const customGenerationProperties = parseCustomGenerationProperties(params);

				startRun(res, "Manual run stopped by user", async (sendEvent, progress, signal) => {
					sendEvent("progress", {
						message: `Running generation (manual mode): dataset=${dataset}, model=${model}`,
					});

					const generationResult = await config.runGeneration(
						{
							dataset,
							model,
							judgeModel: config.defaultJudgeModel,
							customGenerationProperties,
						},
						progress,
						signal,
					);
					signal.throwIfAborted();

					const { scenario } = generationResult;
					mergeCustomGenerationProperties(scenario, customGenerationProperties);

					// Validate image paths are within the generation results directory before writing
					const allowedRoot = path.resolve(generationResult.resultsDirPath) + path.sep;
					for (const ds of scenario.datasetArtifacts) {
						for (const image of ds.images ?? []) {
							if (typeof image === "string") {
								const imagePath = path.resolve(image);
								if (!imagePath.startsWith(allowedRoot)) {
									throw new Error("Image path is outside the allowed directory");
								}
							}
						}
					}

					const timestamp = new Date().toISOString();
					const logger = createLogger(progress);

					// Build an initial result with empty scores and write the full standard structure
					// under {resultsDir}/manual/ using the same format as eval runs.
					const initialResult = buildManualRunResult(scenario, timestamp);
					const manualRunDir = writeResultsToDirectory(
						initialResult,
						path.join(resultsDir, "manual"),
						logger,
					);
					const runDirName = path.basename(manualRunDir);

					// Build dataset info for the client (image URLs derived from what was written to disk)
					const datasetInfos = scenario.datasetArtifacts.map((ds) => {
						const dirName = getDatasetDirectoryName(ds.name);
						const imageUrls = (ds.images ?? []).map((image, index) => {
							const fileName =
								typeof image === "string" ? path.basename(image) : `image${index}.png`;
							return `/api/results/manual/${runDirName}/${dirName}/${fileName}`;
						});
						return { name: ds.name, dirName, imageUrls };
					});

					activeAbortController = undefined;
					sendEvent("complete", {
						runDirName,
						scenarioName: scenario.name,
						timestamp,
						rubrics: scenario.llmEvalConfig.rubrics,
						scale: scenario.llmEvalConfig.defaultScale ?? DEFAULT_SCALE,
						datasets: datasetInfos,
					});
					res.end();
				});
			});
			return;
		}

		// API: save human scores for a manual run
		if (url.pathname === "/api/save-scores" && req.method === "POST") {
			readBody(req).then((body) => {
				try {
					const { runDirName, scores: rawScores } = JSON.parse(body) as {
						runDirName: string;
						scores: Record<
							string,
							Record<string, { score: number | string | undefined; reasoning: string }>
						>;
					};
					if (!runDirName || !rawScores) {
						sendJson(res, { error: "Missing runDirName or scores" }, 400);
						return;
					}
					const sanitizedRunDirName = path.basename(runDirName);
					const runDir = path.join(resultsDir, "manual", sanitizedRunDirName);
					const resolvedRunDir = path.resolve(runDir);
					const manualDir = path.resolve(path.join(resultsDir, "manual"));
					if (
						!resolvedRunDir.startsWith(manualDir + path.sep) ||
						!fs.existsSync(resolvedRunDir)
					) {
						sendJson(res, { error: "Run directory not found or invalid" }, 404);
						return;
					}
					// Normalize scores: convert empty strings to undefined so downstream code sees number | undefined
					const scores: Record<
						string,
						Record<string, { score: number | undefined; reasoning: string }>
					> = {};
					for (const [dsName, dsScores] of Object.entries(rawScores)) {
						scores[dsName] = {};
						for (const [rubricName, { score: rawScore, reasoning }] of Object.entries(
							dsScores,
						)) {
							const parsed = Number(rawScore);
							scores[dsName][rubricName] = {
								score:
									rawScore !== undefined && rawScore !== "" && !Number.isNaN(parsed)
										? parsed
										: undefined,
								reasoning,
							};
						}
					}

					// Regenerate result.json and summary.md with the updated scores
					updateManualResultFiles(runDir, scores);

					sendJson(res, { success: true });
				} catch (error) {
					sendJson(
						res,
						{ error: error instanceof Error ? error.message : String(error) },
						500,
					);
				}
			});
			return;
		}

		// API: list manual runs
		if (url.pathname === "/api/manual-runs" && req.method === "GET") {
			sendJson(res, listManualRuns(resultsDir));
			return;
		}

		// API: stop a running eval
		if (url.pathname === "/api/stop-eval" && req.method === "POST") {
			if (activeAbortController) {
				activeAbortController.abort();
				sendJson(res, { stopped: true });
			} else {
				sendJson(res, { stopped: false, message: "No eval running" });
			}
			return;
		}

		// API: serve dataset files
		if (url.pathname.startsWith("/api/datasets/")) {
			serveStaticFile(res, datasetsDir, url.pathname.replace("/api/datasets/", ""));
			return;
		}

		// API: serve result files
		if (url.pathname.startsWith("/api/results/")) {
			serveStaticFile(res, resultsDir, url.pathname.replace("/api/results/", ""));
			return;
		}

		res.writeHead(404);
		res.end("Not found");
	});

	server.listen(port, () => {
		console.log(`\n  ${appName} Eval GUI`);
		console.log(`  ${"─".repeat(appName.length + 9)}`);
		console.log(`  Running at: http://localhost:${port}`);
		console.log(`  Results:    ${resultsDir}\n`);
	});

	return server;
}
