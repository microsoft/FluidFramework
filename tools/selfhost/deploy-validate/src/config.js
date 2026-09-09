/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const fs = require("node:fs");

class ConfigError extends Error {}

const REQUIRED_ENDPOINTS = ["alfred", "nexus", "historian"];

function writeConfig(filePath, { tenantId, endpoints }) {
	fs.writeFileSync(filePath, JSON.stringify({ tenantId, endpoints }, null, 2));
}

function readConfig(filePath) {
	let raw;
	try {
		raw = fs.readFileSync(filePath, "utf8");
	} catch (err) {
		throw new ConfigError(`Could not read config file ${filePath}: ${err.message}`);
	}

	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new ConfigError(`Config file ${filePath} is not valid JSON: ${err.message}`);
	}

	if (!parsed.tenantId || typeof parsed.tenantId !== "string") {
		throw new ConfigError(`Config file ${filePath} is missing a string "tenantId"`);
	}
	for (const name of REQUIRED_ENDPOINTS) {
		if (!parsed.endpoints || typeof parsed.endpoints[name] !== "string") {
			throw new ConfigError(`Config file ${filePath} is missing endpoints.${name}`);
		}
	}
	if (
		parsed.tokenService !== undefined &&
		(!parsed.tokenService ||
			typeof parsed.tokenService.url !== "string" ||
			parsed.tokenService.url.length === 0 ||
			typeof parsed.tokenService.appId !== "string" ||
			parsed.tokenService.appId.length === 0)
	) {
		throw new ConfigError(`Config file ${filePath} has invalid tokenService configuration`);
	}
	return parsed;
}

module.exports = { writeConfig, readConfig, ConfigError };
