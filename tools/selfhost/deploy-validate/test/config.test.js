/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { writeConfig, readConfig, ConfigError } = require("../src/config");

test("writeConfig then readConfig round-trips", () => {
	const file = path.join(os.tmpdir(), `deploy-validate-test-${Date.now()}.json`);
	const input = {
		tenantId: "fluid",
		endpoints: {
			alfred: "https://alfred.example.z01.azurefd.net",
			nexus: "wss://nexus.example.z01.azurefd.net",
			historian: "https://historian.example.z01.azurefd.net",
		},
	};
	writeConfig(file, input);
	const result = readConfig(file);
	assert.deepEqual(result, input);
	fs.unlinkSync(file);
});

test("readConfig throws ConfigError on a missing file", () => {
	assert.throws(() => readConfig("/tmp/does-not-exist-deploy-validate.json"), ConfigError);
});

test("readConfig throws ConfigError when a required endpoint is missing", () => {
	const file = path.join(os.tmpdir(), `deploy-validate-test-bad-${Date.now()}.json`);
	fs.writeFileSync(file, JSON.stringify({ tenantId: "fluid", endpoints: {} }));
	assert.throws(() => readConfig(file), ConfigError);
	fs.unlinkSync(file);
});

test("readConfig accepts token-service mode", () => {
	const file = path.join(os.tmpdir(), `deploy-validate-test-token-service-${Date.now()}.json`);
	const input = {
		tenantId: "fluid",
		endpoints: {
			alfred: "https://alfred.example.z01.azurefd.net",
			nexus: "wss://nexus.example.z01.azurefd.net",
			historian: "https://historian.example.z01.azurefd.net",
		},
		tokenService: {
			url: "https://tokens.example/api/token",
			appId: "00000000-0000-0000-0000-000000000001",
		},
	};
	fs.writeFileSync(file, JSON.stringify(input));
	assert.deepEqual(readConfig(file), input);
	fs.unlinkSync(file);
});

test("readConfig rejects an invalid token-service URL", () => {
	const file = path.join(
		os.tmpdir(),
		`deploy-validate-test-token-service-bad-${Date.now()}.json`,
	);
	fs.writeFileSync(
		file,
		JSON.stringify({
			tenantId: "fluid",
			endpoints: {
				alfred: "https://alfred.example",
				nexus: "wss://nexus.example",
				historian: "https://historian.example",
			},
			tokenService: {},
		}),
	);
	assert.throws(() => readConfig(file), ConfigError);
	fs.unlinkSync(file);
});
