/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cli = fileURLToPath(new URL("cli.js", pathToFileURL(require.resolve("linkinator"))));
const configuration = readFileSync(
	new URL("../../linkinator.config.json", import.meta.url),
	"utf8",
);
const packageJson: { scripts: { "check-links": string } } = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const [, ...arguments_] = packageJson.scripts["check-links"].split(" ");

describe("link checker", () => {
	let server: Server;
	let directory: string;
	let origin: string;
	let requests: string[];
	let broken: "page" | "fragment" | "css" | undefined;
	let transientFailures: number;
	let interruptedPath: string | undefined;

	beforeEach(async () => {
		directory = mkdtempSync(join(tmpdir(), "link-checker-test-"));
		requests = [];
		broken = undefined;
		transientFailures = 0;
		interruptedPath = undefined;
		server = createServer((request, response) => {
			const path = request.url ?? "/";
			requests.push(path);
			if (path === interruptedPath) {
				response.writeHead(200, {
					"Content-Type": path.endsWith(".css") ? "text/css" : "text/html",
					"Content-Length": "10000",
				});
				response.write(
					path.endsWith(".css")
						? "body { background: url('/missing.png'); }"
						: '<a href="/missing">Missing</a>',
				);
				setTimeout(() => response.destroy(), 25);
				return;
			}
			if (path === "/target" && transientFailures > 0) {
				transientFailures--;
				response.writeHead(503);
				response.end("Temporarily unavailable");
				return;
			}
			const pages: Record<string, string> = {
				"/": `<a href="/nested">Nested</a>
					<a href="http://127.0.0.1:1/external">External</a>
					<script src="/pagefind/missing.js"></script>
					<link rel="stylesheet" href="/assets/css/styles.fixture.css">`,
				"/nested": `<a href="/target#${broken === "fragment" ? "missing" : "present"}">Target</a>
					<link rel="stylesheet" href="/theme.css">
					${broken === "page" ? '<a href="/missing">Missing</a>' : ""}`,
				"/target": '<h1 id="present">Target</h1>',
				"/theme.css": broken === "css" ? "body { background: url('/missing.png'); }" : "",
			};
			const content = pages[path];
			response.writeHead(content === undefined ? 404 : 200, {
				"Content-Type": path.endsWith(".css") ? "text/css" : "text/html",
			});
			response.end(content ?? "Not found");
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected an HTTP listening address");
		}
		origin = `http://127.0.0.1:${address.port}`;
		writeFileSync(
			join(directory, "linkinator.config.json"),
			configuration.replaceAll(":3000", `:${address.port}`),
		);
	});

	afterEach(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error === undefined ? resolve() : reject(error))),
		);
		rmSync(directory, { recursive: true, force: true });
	});

	async function check(): Promise<{ code: number | null; output: string }> {
		return new Promise((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[
					cli,
					...arguments_.map((argument) =>
						argument === "http://127.0.0.1:3000" ? origin : argument,
					),
				],
				{
					cwd: directory,
					timeout: 15_000,
				},
			);
			let output = "";
			child.stdout.on("data", (data: Buffer) => {
				output += data.toString();
			});
			child.stderr.on("data", (data: Buffer) => {
				output += data.toString();
			});
			child.on("error", reject);
			child.on("close", (code) => resolve({ code, output }));
		});
	}

	it.each(["missing", "malformed"] as const)(
		"rejects a %s configuration before making requests",
		async (kind) => {
			const configPath = join(directory, "linkinator.config.json");
			if (kind === "missing") {
				rmSync(configPath);
			} else {
				writeFileSync(configPath, "{malformed");
			}

			const result = await check();
			expect(result.code, result.output).toBe(1);
			expect(result.output).toContain("linkinator.config.json");
			expect(result.output).toContain(kind === "missing" ? "ENOENT" : "Error parsing");
			expect(requests).toEqual([]);
		},
	);

	it("crawls nested pages and retains local-only and generated-asset exclusions", async () => {
		const result = await check();
		expect(result.code, result.output).toBe(0);
		expect(requests).toContain("/nested");
		expect(requests).toContain("/target");
		expect(requests).toContain("/theme.css");
		expect(requests).not.toContain("/pagefind/missing.js");
		expect(requests).not.toContain("/assets/css/styles.fixture.css");
	});

	it.each(["page", "fragment", "css"] as const)(
		"fails for a broken %s discovered below the entry page",
		async (kind) => {
			broken = kind;
			const result = await check();
			expect(result.code, result.output).toBe(1);
			expect(result.output).toContain(
				kind === "page" ? "/missing" : kind === "fragment" ? "#missing" : "/missing.png",
			);
		},
	);

	it.each(["/nested", "/theme.css"])(
		"fails instead of reporting success when the body of %s is interrupted",
		async (path) => {
			interruptedPath = path;
			const result = await check();
			expect(result.code, result.output).toBe(1);
			expect(result.output).not.toContain("Successfully scanned");
			expect(requests).toContain(path);
		},
	);

	it.each([
		{ failures: 1, code: 0 },
		{ failures: 3, code: 1 },
	])(
		"returns $code after $failures consecutive server failures",
		async ({ failures, code }) => {
			transientFailures = failures;
			const result = await check();
			expect(result.code, result.output).toBe(code);
			expect(requests.filter((path) => path === "/target").length).toBeGreaterThan(1);
		},
		15_000,
	);
});
