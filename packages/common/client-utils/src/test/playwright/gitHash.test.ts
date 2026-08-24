/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gitHashFile, hashFile } from "../../indexNode.js";
import type { BrowserHashApi } from "./browserHash.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Tests run from lib/test/playwright/ after build; assets live at the source location.
const assetsDir = path.resolve(here, "../../../src/test/playwright/assets");
const browserHashBundlePath = path.join(here, "browserHash.bundle.js");

let xmlFile: Buffer;
let svgFile: Buffer;
let pdfFile: Buffer;
let gifFile: Buffer;
let server: http.Server;
let serverUrl: string;

test.beforeAll(async () => {
	// crypto.subtle is only available in secure contexts (https or localhost),
	// so spin up a basic http server on localhost to navigate to.
	server = http.createServer((_req, res) => {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/plain");
		res.end("basic test server");
	});

	await new Promise<void>((resolve, reject) => {
		server.on("listening", () => {
			resolve();
		});
		server.on("error", (err) => {
			reject(err);
		});
		server.listen(0, "localhost");
	});

	const port: number = (server.address() as AddressInfo).port;
	serverUrl = `http://localhost:${port}`;

	xmlFile = await fs.readFile(path.join(assetsDir, "book.xml"));
	svgFile = await fs.readFile(path.join(assetsDir, "bindy.svg"));
	pdfFile = await fs.readFile(path.join(assetsDir, "aka.pdf"));
	gifFile = await fs.readFile(path.join(assetsDir, "grid.gif"));
});

test.afterAll(async () => {
	await new Promise<void>((resolve, reject) => {
		server?.close((err) => (err ? reject(err) : resolve()));
	});
});

test.beforeEach(async ({ page }) => {
	await page.goto(serverUrl, { waitUntil: "load" });
	await page.addScriptTag({ path: browserHashBundlePath });
});

async function browserHash(
	page: Page,
	file: Buffer,
	algorithm: "SHA-1" | "SHA-256",
	encoding: "hex" | "base64",
): Promise<string> {
	return page.evaluate(
		async ({ fileBase64, hashAlgorithm, hashEncoding }) =>
			(
				globalThis as typeof globalThis & { browserHashApi: BrowserHashApi }
			).browserHashApi.hashFile(fileBase64, hashAlgorithm, hashEncoding),
		{
			fileBase64: file.toString("base64"),
			hashAlgorithm: algorithm,
			hashEncoding: encoding,
		},
	);
}

async function browserGitHash(page: Page, file: Buffer): Promise<string> {
	return page.evaluate(
		async (fileBase64) =>
			(
				globalThis as typeof globalThis & { browserHashApi: BrowserHashApi }
			).browserHashApi.gitHashFile(fileBase64),
		file.toString("base64"),
	);
}

test.describe("Client-Utils", () => {
	// Expected hashes are from `git hash-object <file>...` — make sure the file
	// is the real file and not an LFS stub.
	test.describe("gitHashFile", () => {
		test("XML should Hash", async ({ page }) => {
			const expectedHash = "64056b04956fb446b4014cb8d159d2e2494ed0fc";
			const hashNode = await gitHashFile(xmlFile);
			const hashBrowser = await browserGitHash(page, xmlFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("SVG should Hash", async ({ page }) => {
			const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
			const hashNode = await gitHashFile(svgFile);
			const hashBrowser = await browserGitHash(page, svgFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("AKA PDF should Hash", async ({ page }) => {
			const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
			const hashNode = await gitHashFile(pdfFile);
			const hashBrowser = await browserGitHash(page, pdfFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("Grid GIF should Hash", async ({ page }) => {
			const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
			const hashNode = await gitHashFile(gifFile);
			const hashBrowser = await browserGitHash(page, gifFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("Hash is consistent", async ({ page }) => {
			const hash1Node = await gitHashFile(svgFile);
			const hash2Node = await gitHashFile(svgFile);
			expect(hash1Node).toEqual(hash2Node);

			const hash1Browser = await browserGitHash(page, svgFile);
			const hash2Browser = await browserGitHash(page, svgFile);
			expect(hash1Browser).toEqual(hash2Browser);
		});
	});

	test.describe("hashFile", () => {
		test("SHA256 hashes match", async ({ page }) => {
			const expectedHash = "9b8abd0b90324ffce0b6a9630e5c4301972c364ed9aeb7e7329e424a4ae8a630";
			const hashNode = await hashFile(svgFile, "SHA-256");
			const hashBrowser = await browserHash(page, svgFile, "SHA-256", "hex");
			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("base64 encoded hashes match", async ({ page }) => {
			const expectedHash1 = "4/nXhjtBQhhvXTNNSNq/cJgb4sQ=";
			const hashNode1 = await hashFile(xmlFile, "SHA-1", "base64");
			const hashBrowser1 = await browserHash(page, xmlFile, "SHA-1", "base64");
			expect(hashNode1).toEqual(expectedHash1);
			expect(hashBrowser1).toEqual(expectedHash1);

			const expectedHash256 = "QPQh34aj1TNmyo34aPDA0vMIU7r5QC/6KNgIzlLYiFY=";
			const hashNode256 = await hashFile(pdfFile, "SHA-256", "base64");
			const hashBrowser256 = await browserHash(page, pdfFile, "SHA-256", "base64");
			expect(hashNode256).toEqual(expectedHash256);
			expect(hashBrowser256).toEqual(expectedHash256);
		});
	});
});
