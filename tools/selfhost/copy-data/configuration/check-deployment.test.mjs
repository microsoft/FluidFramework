/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkDependencies, verifyDeployment } from "./check-deployment.mjs";

const config = {
	selfHost: { subscriptionId: "sub", resourceGroup: "group", aksName: "aks" },
	selfHostNamespace: "test-namespace",
};
const pod = (name) => ({
	metadata: { name },
	status: { phase: "Running", containerStatuses: [{ ready: true }] },
});

test("dependency check reports installation instructions before any deployment access", async () => {
	const error = Object.assign(new Error("not retained"), { code: "ERR_MODULE_NOT_FOUND" });
	await assert.rejects(
		checkDependencies(async () => {
			throw error;
		}),
		/pnpm install --ignore-workspace/,
	);
	await checkDependencies(async () => ({}));
	const unexpected = new Error("initialization failed");
	await assert.rejects(
		checkDependencies(async () => {
			throw unexpected;
		}),
		(error) => error === unexpected,
	);
});

test("checks all Alfred replicas using an isolated kubeconfig, then removes it", async () => {
	const calls = [];
	let kubeconfig;
	const execute = async (command, args) => {
		calls.push({ command, args });
		if (command === "az") {
			kubeconfig = args[args.indexOf("--file") + 1];
			assert.equal((await stat(path.dirname(kubeconfig))).mode & 0o777, 0o700);
			return { stdout: "" };
		}
		if (args.includes("get"))
			return { stdout: JSON.stringify({ items: [pod("a"), pod("b")] }) };
		return { stdout: "false" };
	};
	await verifyDeployment(config, execute);
	assert.equal(calls.filter((call) => call.args.includes("exec")).length, 2);
	assert.ok(calls[0].args.includes("--subscription"));
	assert.ok(calls[0].args.includes("sub"));
	for (const call of calls.slice(1)) {
		assert.ok(call.args.includes(kubeconfig));
		assert.ok(call.args.includes("test-namespace"));
		if (call.args.includes("exec")) {
			assert.match(
				call.args.at(-1),
				/require\.resolve\("nconf",\{paths:\["\.\/packages\/routerlicious"\]\}\)/,
			);
		}
	}
	await assert.rejects(access(path.dirname(kubeconfig)), { code: "ENOENT" });
});

test("true, absent, or non-boolean effective flags stop migration", async () => {
	for (const flag of ["true", "null", '"false"', ""]) {
		await assert.rejects(
			verifyDeployment(config, async (command, args) => ({
				stdout:
					command === "az"
						? ""
						: args.includes("get")
							? JSON.stringify({ items: [pod("a")] })
							: flag,
			})),
			/must explicitly set alfred.enforceServerGeneratedDocumentId to false/,
		);
	}
});

test("missing and unready Alfred replicas cannot pass", async () => {
	for (const items of [[], [{ metadata: { name: "a" }, status: { phase: "Pending" } }]]) {
		await assert.rejects(
			verifyDeployment(config, async (command) => ({
				stdout: command === "az" ? "" : JSON.stringify({ items }),
			})),
			/No Alfred replicas|Wait for every Alfred replica/,
		);
	}
});

test("deployment failures are actionable and never print command output containing secrets", async () => {
	await assert.rejects(
		verifyDeployment(config, async () => {
			throw Object.assign(new Error("secret-output"), { stderr: "secret-output" });
		}),
		(error) => {
			assert.match(error.message, /Verify Azure sign-in/);
			assert.doesNotMatch(error.message, /secret-output/);
			return true;
		},
	);
});
