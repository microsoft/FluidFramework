/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

/**
 * Runs hooks in a separate process because they replace the global logger and console functions.
 */
function runFailingTest(
	properties: Record<string, unknown>,
	message = "Unable to get drive/item id from path",
): {
	event: ITelemetryBaseEvent;
	output: string;
} {
	const loggerSpecifier = `data:text/javascript,${encodeURIComponent(`
		export const events = [];
		export function createTestLogger() {
			return { send: (event) => events.push(event), flush: async () => {} };
		}
	`)}`;
	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`
				import { strict as assert } from "node:assert";
				import { mochaHooks } from ${JSON.stringify(new URL("../mochaHooks.js", import.meta.url).href)};
				const { events } = await import(${JSON.stringify(loggerSpecifier)});
				await mochaHooks.beforeAll();
				const failure = Object.assign(new Error(${JSON.stringify(message)}), ${JSON.stringify(properties)});
				const test = { state: "failed", err: failure };
				mochaHooks.afterEach.call({ currentTest: test });
				assert.equal(test.err, failure);
				assert.equal(test.err.message, ${JSON.stringify(message)});
				assert.equal(events.length, 1);
				console.log(JSON.stringify(events[0]));
			`,
		],
		{
			encoding: "utf8",
			env: { ...process.env, FLUID_TEST_LOGGER_PKG_SPECIFIER: loggerSpecifier },
		},
	);
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
	const lines = result.stdout.trim().split("\n");
	const event: ITelemetryBaseEvent = JSON.parse(lines.at(-1) ?? "");
	return { event, output: result.stdout + result.stderr };
}

describe("mocha hook failure diagnostics", () => {
	it("preserves throttling diagnostics without copying sensitive error properties", () => {
		const diagnostics = {
			statusCode: 429,
			retryAfterSeconds: 30,
			sprequestguid: "sharepoint-request-guid",
			requestId: "request-id",
			clientRequestId: "client-request-id",
		};
		const { event, output } = runFailingTest({
			...diagnostics,
			url: "https://example.com/private-document?token=secret-token",
			headers: { Authorization: "Bearer secret-token" },
		});
		assert.equal(event.eventName, "fluid:telemetry:Test_end");
		assert.equal(event.error, "Unable to get drive/item id from path");
		assert.equal(typeof event.stack, "string");
		for (const key of Object.keys(diagnostics)) {
			assert.equal(event[key], undefined);
		}
		assert.ok(
			output.includes(
				`Unable to get drive/item id from path; ODSP lookup failure diagnostics: ${JSON.stringify(diagnostics)}`,
			),
		);
		assert.ok(!output.includes("secret-token"));
		assert.ok(!output.includes("private-document"));
		assert.equal(event.url, undefined);
		assert.equal(event.headers, undefined);
	});

	it("reports a missing-file status without inventing retry information", () => {
		const { event, output } = runFailingTest({ statusCode: 404 });
		assert.equal(event.statusCode, undefined);
		assert.equal(event.retryAfterSeconds, undefined);
		assert.ok(output.includes('ODSP lookup failure diagnostics: {"statusCode":404}'));
	});

	it("does not copy nonprimitive network properties", () => {
		const { event, output } = runFailingTest({
			statusCode: { sensitive: "secret-value" },
		});
		assert.equal(event.error, "Unable to get drive/item id from path");
		assert.equal(typeof event.stack, "string");
		assert.equal(event.statusCode, undefined);
		assert.ok(output.includes("ODSP lookup failure diagnostics: {}"));
		assert.ok(!output.includes("secret-value"));
	});

	it("does not print diagnostics for other failures, even with an HTTP status", () => {
		const { event, output } = runFailingTest({ statusCode: 503 }, "Another failure");
		assert.equal(event.error, "Another failure");
		assert.equal(event.statusCode, undefined);
		assert.ok(!output.includes("ODSP lookup failure diagnostics:"));
	});
});
