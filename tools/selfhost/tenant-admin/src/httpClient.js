/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Minimal JSON-over-HTTP client used to talk to riddler and gitrest.
//
// Deliberately dependency-free (node:http / node:https only) so the CLI can be dropped into the
// routerlicious container image and run with `node` -- no npm install, no node_modules to ship
// into the cluster. See ../README.md ("Why zero dependencies").
//
// Two behaviours worth calling out:
//   - every request carries an x-correlation-id, so a tenant operation can be traced across
//     tenant-admin -> riddler -> mongo in the services' telemetry output.
//   - request bodies are NEVER attached to thrown errors. A failed tenant create/refresh has a
//     plaintext tenant key in its request or response, and an unredacted HTTP-client error would
//     print it into logs. See redactSecrets() below.

"use strict";

const http = require("node:http");
const https = require("node:https");
const { randomUUID } = require("node:crypto");

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Keys whose values must never appear in an error message or log line.
 * Matched case-insensitively against JSON property names.
 */
const SECRET_KEYS = ["key", "key1", "key2", "secondarykey", "secret", "password"];

class RequestError extends Error {
	constructor(message, { status, url, method, responseBody } = {}) {
		super(message);
		this.name = "RequestError";
		this.status = status;
		this.url = url;
		this.method = method;
		// Response body is kept (redacted) because riddler's error text is the only useful
		// diagnostic. The REQUEST body is never kept.
		this.responseBody = responseBody;
	}
}

/**
 * Replace the value of any secret-looking property with "[REDACTED]".
 * Operates on strings (best-effort JSON parse) and on plain objects.
 * @param {unknown} value
 * @returns {unknown}
 */
function redactSecrets(value) {
	if (value === null || value === undefined) {
		return value;
	}
	if (typeof value === "string") {
		let parsed;
		try {
			parsed = JSON.parse(value);
		} catch {
			return value;
		}
		return JSON.stringify(redactSecrets(parsed));
	}
	if (Array.isArray(value)) {
		return value.map((entry) => redactSecrets(entry));
	}
	if (typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = SECRET_KEYS.includes(k.toLowerCase())
				? "[REDACTED]"
				: redactSecrets(v);
		}
		return out;
	}
	return value;
}

/**
 * Perform a JSON HTTP request.
 * @param {object} options
 * @param {string} options.baseUrl e.g. "http://fluid-riddler"
 * @param {string} options.method
 * @param {string} options.path must already be URL-encoded
 * @param {unknown} [options.body] serialized as JSON when present
 * @param {number} [options.timeoutMs]
 * @param {string} [options.correlationId]
 * @returns {Promise<{status: number, body: string, json: unknown}>}
 */
async function request({
	baseUrl,
	method,
	path,
	body,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	correlationId = randomUUID(),
}) {
	const url = new URL(path, baseUrl);
	const transport = url.protocol === "https:" ? https : http;
	const payload = body === undefined ? undefined : JSON.stringify(body);

	return new Promise((resolve, reject) => {
		const req = transport.request(
			{
				protocol: url.protocol,
				hostname: url.hostname,
				port: url.port,
				method,
				path: `${url.pathname}${url.search}`,
				headers: {
					Accept: "application/json",
					"x-correlation-id": correlationId,
					...(payload
						? {
								"Content-Type": "application/json",
								"Content-Length": Buffer.byteLength(payload),
							}
						: {}),
				},
			},
			(res) => {
				let data = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					data += chunk;
				});
				res.on("end", () => {
					let json;
					try {
						json = data === "" ? undefined : JSON.parse(data);
					} catch {
						json = undefined;
					}
					resolve({ status: res.statusCode, body: data, json });
				});
			},
		);

		req.on("error", (err) => {
			// err.message here is a transport failure (ECONNREFUSED, DNS, ...). It cannot
			// contain the request body, so it is safe to surface verbatim.
			reject(
				new RequestError(`${method} ${url.pathname} failed: ${err.message}`, {
					url: `${url.origin}${url.pathname}`,
					method,
				}),
			);
		});
		req.setTimeout(timeoutMs, () => {
			req.destroy(
				new RequestError(
					`${method} ${url.pathname} timed out after ${timeoutMs}ms`,
					{ url: `${url.origin}${url.pathname}`, method },
				),
			);
		});

		if (payload !== undefined) {
			req.write(payload);
		}
		req.end();
	});
}

/**
 * Perform a request and throw a RequestError on any non-2xx status.
 * @param {object} options same shape as request()
 * @param {(status: number, json: unknown, rawBody: string) => string | undefined} [options.describeError]
 *   optional hook to turn a known error response into a friendlier message.
 * @returns {Promise<{status: number, body: string, json: unknown}>}
 */
async function requestOk(options) {
	const { describeError, ...rest } = options;
	const res = await request(rest);
	if (res.status < 200 || res.status >= 300) {
		const friendly = describeError?.(res.status, res.json, res.body);
		const redacted = redactSecrets(res.body);
		throw new RequestError(
			friendly ??
				`${rest.method} ${rest.path} returned HTTP ${res.status}: ${redacted}`,
			{
				status: res.status,
				url: `${rest.baseUrl}${rest.path}`,
				method: rest.method,
				responseBody: redacted,
			},
		);
	}
	return res;
}

module.exports = {
	DEFAULT_TIMEOUT_MS,
	RequestError,
	redactSecrets,
	request,
	requestOk,
};
