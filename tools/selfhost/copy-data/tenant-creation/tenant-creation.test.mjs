/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { createMissingTenants } from "./tenant-creation.mjs";
import { safeErrorMessage } from "../configuration/errors.mjs";

const execFileAsync = promisify(execFile);

const config = {
	selfHostNamespace: "default",
	selfHost: {
		subscriptionId: "subscription",
		resourceGroup: "resource-group",
		aksName: "aks",
		contact: "owner@example.com",
	},
};

test("creates only missing target tenants", async () => {
	const calls = [];
	const execute = async (_file, argumentsList) => {
		calls.push(argumentsList);
		if (argumentsList.at(-1) === "list")
			return { stdout: JSON.stringify([{ id: "existing" }]) };
		return { stdout: JSON.stringify({ tenantId: "missing", key1: "secret", key2: "secret" }) };
	};
	const created = await createMissingTenants(
		config,
		{
			tenants: {
				sourceOne: { selfHostTenantId: "existing" },
				sourceTwo: { selfHostTenantId: "missing" },
			},
		},
		execute,
	);

	assert.deepEqual(created, ["missing"]);
	assert.deepEqual(calls[1].slice(-4), [
		"create",
		"missing",
		"--contact",
		"owner@example.com",
	]);
});

test("a real child process can list more than 4 KiB of existing tenants without creating them again", async () => {
	let calls = 0;
	const created = await createMissingTenants(
		config,
		{
			tenants: {
				sourceOne: { selfHostTenantId: "existing-0" },
				sourceTwo: { selfHostTenantId: "existing-1" },
			},
		},
		async (_file, args, options) => {
			calls++;
			assert.equal(args.at(-1), "list");
			assert.equal(options.maxBuffer, 8 * 1024 * 1024);
			const result = await execFileAsync(
				process.execPath,
				[
					"-e",
					"process.stdout.write(JSON.stringify(Array.from({length:6},(_,i)=>({id:'existing-'+i,customData:{padding:'x'.repeat(1000)}}))))",
				],
				options,
			);
			assert.ok(Buffer.byteLength(result.stdout) > 4096);
			return result;
		},
	);
	assert.deepEqual(created, []);
	assert.equal(calls, 1);
});

test("a tenant created earlier in this run is reused by another source mapping", async () => {
	const calls = [];
	const created = await createMissingTenants(
		config,
		{
			tenants: {
				sourceOne: { selfHostTenantId: "shared" },
				sourceTwo: { selfHostTenantId: "shared" },
			},
		},
		async (_file, args) => {
			calls.push(args);
			return {
				stdout: JSON.stringify(
					args.at(-1) === "list" ? [] : { tenantId: "shared", key1: "not-logged" },
				),
			};
		},
	);
	assert.deepEqual(created, ["shared"]);
	assert.equal(calls.length, 2);
});

test("rerunning after an interrupted create checks existing tenants before another creation attempt", async () => {
	let exists = false;
	let creates = 0;
	const inventory = {
		tenants: { source: { selfHostTenantId: "created-before-interruption" } },
	};
	const execute = async (_file, args) => {
		if (args.at(-1) === "list")
			return { stdout: JSON.stringify(exists ? [{ id: "created-before-interruption" }] : []) };
		creates++;
		exists = true;
		throw Object.assign(new Error("private-output-with-key"), {
			code: 1,
			stdout: "private-key",
		});
	};
	await assert.rejects(createMissingTenants(config, inventory, execute), (error) => {
		assert.match(safeErrorMessage(error), /tenant-admin create failed with exit code 1/);
		assert.match(error.message, /Creation may have completed/);
		assert.doesNotMatch(error.message, /private/);
		return true;
	});
	assert.deepEqual(await createMissingTenants(config, inventory, execute), []);
	assert.equal(creates, 1);
});

test("oversized child output fails explicitly rather than being described as a network failure", async () => {
	await assert.rejects(
		createMissingTenants(config, { tenants: {} }, (_file, _args, options) =>
			execFileAsync(
				process.execPath,
				["-e", "process.stdout.write('x'.repeat(8*1024*1024+1))"],
				options,
			),
		),
		(error) => {
			assert.match(
				safeErrorMessage(error),
				/tenant-admin list exceeded the 8 MiB output limit/,
			);
			assert.doesNotMatch(error.message, /network|xxxx/);
			return true;
		},
	);
});

test("invalid tenant lists and command failures never trigger creates or leak command output", async () => {
	for (const stdout of ["invalid-private-key-json", "null", "{}", '[{"id":7}]', "[null]"]) {
		let calls = 0;
		await assert.rejects(
			createMissingTenants(
				config,
				{ tenants: { source: { selfHostTenantId: "missing" } } },
				async () => {
					calls++;
					return { stdout };
				},
			),
			(error) => {
				assert.equal(error.name, "StageError");
				assert.match(
					error.message,
					/tenant-admin list returned invalid JSON|invalid tenant collection/,
				);
				assert.doesNotMatch(error.message, /private-key/);
				return true;
			},
		);
		assert.equal(calls, 1);
	}
	await assert.rejects(
		createMissingTenants(config, { tenants: {} }, async () => {
			throw Object.assign(new Error("private-key"), { code: "ENOENT", stderr: "private-key" });
		}),
		(error) => {
			assert.match(safeErrorMessage(error), /tenant-admin list could not start/);
			assert.doesNotMatch(error.message, /private-key/);
			return true;
		},
	);
});
