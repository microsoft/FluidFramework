/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { ConfigurationError } from "./configuration.mjs";

export function parseCopyOptions(
	argv,
	{ command = "copy-data.mjs", requireExecute = true } = {},
) {
	const options = {
		configPath: path.join(import.meta.dirname, "parameters", "copy-data.config.json"),
		execute: false,
		concurrency: 1,
		maxSummaryBytes: 64 * 1024 ** 2,
		memoryBudgetBytes: 512 * 1024 ** 2,
		attempts: 3,
		timeoutMs: 45_000,
		copyArgs: [],
	};
	const numbers = {
		"--concurrency": ["concurrency", 1, 4, 1],
		"--max-summary-mib": ["maxSummaryBytes", 1, 1024, 1024 ** 2],
		"--memory-budget-mib": ["memoryBudgetBytes", 2, 8192, 1024 ** 2],
		"--attempts": ["attempts", 1, 10, 1],
		"--request-timeout-ms": ["timeoutMs", 1, 45_000, 1],
	};
	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index];
		if (flag === "--help" || flag === "-h") {
			console.log(`Usage: node ${command}${requireExecute ? " --execute" : ""} [--config <path>]
  --concurrency <1-4>          Document workers per tenant (default: 1)
  --max-summary-mib <1-1024>   Maximum response/create payload (default: 64)
  --memory-budget-mib <2-8192>  Serialized payload reservation budget (default: 512)
  --attempts <1-10>            Maximum attempts per transient request (default: 3)
  --request-timeout-ms <1-45000> Per-request deadline (default: 45000)
  --failed-only <results.json> Retry only failed/interrupted documents from a reviewed run`);
			return undefined;
		}
		if (flag === "--execute") {
			options.execute = true;
			continue;
		}
		if (flag !== "--config" && flag !== "--failed-only" && !numbers[flag])
			throw new ConfigurationError([`Unknown argument: ${flag}`]);
		const value = argv[++index];
		if (value === undefined || value.startsWith("--"))
			throw new ConfigurationError([`Missing value for ${flag}`]);
		if (flag === "--config") options.configPath = value;
		else if (flag === "--failed-only") options.failedOnly = path.resolve(value);
		else {
			const [key, min, max, multiplier] = numbers[flag];
			const number = Number(value);
			if (!/^\d+$/.test(value) || !Number.isInteger(number) || number < min || number > max)
				throw new ConfigurationError([`${flag} must be an integer between ${min} and ${max}`]);
			options[key] = number * multiplier;
		}
		if (flag !== "--config") options.copyArgs.push(flag, value);
	}
	if (requireExecute && !options.execute)
		throw new ConfigurationError(["Use --execute to create tenants and copy documents"]);
	if (options.memoryBudgetBytes < 2 * options.maxSummaryBytes)
		throw new ConfigurationError([
			"The memory budget must fit at least two maximum-sized payloads",
		]);
	options.workers = Math.min(
		options.concurrency,
		Math.floor(options.memoryBudgetBytes / (2 * options.maxSummaryBytes)),
	);
	return options;
}
