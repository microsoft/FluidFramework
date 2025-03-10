/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import http from "http";
import { AddressInfo } from "net";
import path from "path";

import rewire from "rewire";

import * as HashNode from "../../common-utils/hashFileNode";

// Use rewire to access private functions
const HashBrowser = rewire("../../common-utils/hashFileBrowser");

async function getFileContents(p: string): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(p, (error, data) => {
			if (error) {
				reject(error);
			}
			resolve(data);
		});
	});
}

const dataDir = "../../../src/test/jest";

async function evaluateBrowserHash(
	page,
	file: Buffer,
	algorithm: "SHA-1" | "SHA-256" = "SHA-1",
	hashEncoding: "hex" | "base64" = "hex",
): Promise<string> {
	// convert the file to a string to pass into page.evaluate because
	// Buffer/Uint8Array are not directly jsonable
	const fileCharCodeString = Array.prototype.map
		.call(file, (byte) => {
			return String.fromCharCode(byte);
		})
		.join("");

	// puppeteer has issues with calling crypto through page.exposeFunction but not directly,
	// so pull in the function as a string and eval it directly instead
	// there are also issues around nested function calls when using page.exposeFunction, so
	// do only the crypto.subtle part in page.evaluate and do the other half outside
	const browserHashFn = HashBrowser.__get__("digestBuffer").toString();
	const hashCharCodeString = await (page.evaluate(
		async (fn, f, alg) => {
			// convert back into Uint8Array
			const fileCharCodes = Array.prototype.map.call([...f], (char) => {
				return char.charCodeAt(0) as number;
			}) as number[];
			const fileUint8 = Uint8Array.from(fileCharCodes);

			// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
			const hashFn = new Function(`"use strict"; return ( ${fn} );`);
			const pageHashArray = await (hashFn()(fileUint8, alg) as Promise<Uint8Array>);

			// Similarly, return the hash array as a string instead of a Uint8Array
			return Array.prototype.map
				.call(pageHashArray, (byte) => {
					return String.fromCharCode(byte);
				})
				.join("");
		},
		browserHashFn,
		fileCharCodeString,
		algorithm,
	) as Promise<string>);

	// reconstruct the Uint8Array from the string
	const charCodes = Array.prototype.map.call([...hashCharCodeString], (char) => {
		return char.charCodeAt(0) as number;
	}) as number[];
	const hashArray = Uint8Array.from(charCodes);
	return HashBrowser.__get__("encodeDigest")(hashArray, hashEncoding) as string;
}

/**
 * Same as evaluateBrowserHash above except prepends the
 * `blob ${size.toString()}${String.fromCharCode(0)}` prefix for git
 * */
async function evaluateBrowserGitHash(page, file: Buffer): Promise<string> {
	// Add the prefix for git hashing
	const size = file.byteLength;
	const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
	const prefixBuffer = Buffer.from(filePrefix, "utf-8");
	const hashBuffer = Buffer.concat([prefixBuffer, file], prefixBuffer.length + file.length);
	return evaluateBrowserHash(page, hashBuffer);
}

describe("Common-Utils", () => {
	let xmlFile: Buffer;
	let svgFile: Buffer;
	let pdfFile: Buffer;
	let gifFile: Buffer;

	let server: http.Server;

	beforeAll(async () => {
		// crypto is only available in secure contexts (https pages) or localhost,
		// so start a basic server to make this available
		server = http.createServer((req, res) => {
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/plain");
			res.end("basic test server");
		});

		await new Promise<void>((resolve) => {
			server.listen(0, "localhost");
			server.on("listening", () => {
				resolve();
			});
			server.on("error", (err) => {
				throw err;
			});
		});

		// Since we're listening on an http port, address() will return an AddressInfo and not just a string
		const port: number = (server.address() as AddressInfo).port;

		// Navigate to the local test server so crypto is available
		await page.goto(`http://localhost:${port}`, { waitUntil: "load", timeout: 0 });

		xmlFile = await getFileContents(path.join(__dirname, `${dataDir}/assets/book.xml`));
		svgFile = await getFileContents(path.join(__dirname, `${dataDir}/assets/bindy.svg`));
		pdfFile = await getFileContents(path.join(__dirname, `${dataDir}/assets/aka.pdf`));
		gifFile = await getFileContents(path.join(__dirname, `${dataDir}/assets/grid.gif`));
	});

	afterAll(async () => {
		await new Promise((resolve) => {
			server.close(resolve);
			// Puppeteer may have lingering connections which prevents the server from closing otherwise.
			server.closeAllConnections();
		});
	});

	// Expected hashes are from git hash-object file...
	// Make sure the hash is of the file and not of an LFS stub
	describe("gitHashFile", () => {
		test("XML should Hash", async () => {
			const expectedHash = "64056b04956fb446b4014cb8d159d2e2494ed0fc";
			const hashNode = await HashNode.gitHashFile(xmlFile);
			const hashBrowser = await evaluateBrowserGitHash(page, xmlFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("SVG should Hash", async () => {
			const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
			const hashNode = await HashNode.gitHashFile(svgFile);
			const hashBrowser = await evaluateBrowserGitHash(page, svgFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("AKA PDF should Hash", async () => {
			const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
			const hashNode = await HashNode.gitHashFile(pdfFile);
			const hashBrowser = await evaluateBrowserGitHash(page, pdfFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("Grid GIF should Hash", async () => {
			const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
			const hashNode = await HashNode.gitHashFile(gifFile);
			const hashBrowser = await evaluateBrowserGitHash(page, gifFile);

			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("Hash is consistent", async () => {
			const hash1Node = await HashNode.gitHashFile(svgFile);
			const hash2Node = await HashNode.gitHashFile(svgFile);
			expect(hash1Node).toEqual(hash2Node);

			const hash1Browser = await evaluateBrowserGitHash(page, svgFile);
			const hash2Browser = await evaluateBrowserGitHash(page, svgFile);
			expect(hash1Browser).toEqual(hash2Browser);
		});
	});

	describe("hashFile", () => {
		test("SHA256 hashes match", async () => {
			const expectedHash = "9b8abd0b90324ffce0b6a9630e5c4301972c364ed9aeb7e7329e424a4ae8a630";
			const hashNode = await HashNode.hashFile(svgFile, "SHA-256");
			const hashBrowser = await evaluateBrowserHash(page, svgFile, "SHA-256");
			expect(hashNode).toEqual(expectedHash);
			expect(hashBrowser).toEqual(expectedHash);
		});

		test("base64 encoded hashes match", async () => {
			const expectedHash1 = "4/nXhjtBQhhvXTNNSNq/cJgb4sQ=";
			const hashNode1 = await HashNode.hashFile(xmlFile, "SHA-1", "base64");
			const hashBrowser1 = await evaluateBrowserHash(page, xmlFile, "SHA-1", "base64");
			expect(hashNode1).toEqual(expectedHash1);
			expect(hashBrowser1).toEqual(expectedHash1);

			const expectedHash256 = "QPQh34aj1TNmyo34aPDA0vMIU7r5QC/6KNgIzlLYiFY=";
			const hashNode256 = await HashNode.hashFile(pdfFile, "SHA-256", "base64");
			const hashBrowser256 = await evaluateBrowserHash(page, pdfFile, "SHA-256", "base64");
			expect(hashNode256).toEqual(expectedHash256);
			expect(hashBrowser256).toEqual(expectedHash256);
		});
	});
});
