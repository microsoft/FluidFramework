/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import { strict as assert } from "assert";

import { gitHashFile } from "../hashFile";

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

const assetsDir = "../../src/test/assets";

describe("hashFile", () => {
	let xmlFile: Buffer;
	let svgFile: Buffer;
	let pdfFile: Buffer;
	let gifFile: Buffer;

	before(async () => {
		/* eslint-disable unicorn/prefer-module */
		xmlFile = await getFileContents(path.join(__dirname, `${assetsDir}/book.xml`));
		svgFile = await getFileContents(path.join(__dirname, `${assetsDir}/bindy.svg`));
		pdfFile = await getFileContents(path.join(__dirname, `${assetsDir}/aka.pdf`));
		gifFile = await getFileContents(path.join(__dirname, `${assetsDir}/grid.gif`));
		/* eslint-enable unicorn/prefer-module */
	});

	// Expected hashes are from git hash-object file...
	// Make sure the hash is of the file and not of an LFS stub
	describe("gitHashFile", () => {
		it("XML should Hash", async () => {
			const expectedHash = "64056b04956fb446b4014cb8d159d2e2494ed0fc";
			const hashNode = await gitHashFile(xmlFile);

			assert.equal(hashNode, expectedHash);
		});

		it("SVG should Hash", async () => {
			const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
			const hashNode = await gitHashFile(svgFile);

			assert.equal(hashNode, expectedHash);
		});

		it("AKA PDF should Hash", async () => {
			const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
			const hashNode = await gitHashFile(pdfFile);

			assert.equal(hashNode, expectedHash);
		});

		it("Grid GIF should Hash", async () => {
			const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
			const hashNode = await gitHashFile(gifFile);

			assert.equal(hashNode, expectedHash);
		});

		it("Hash is consistent", async () => {
			const hash1Node = await gitHashFile(svgFile);
			const hash2Node = await gitHashFile(svgFile);
			assert.equal(hash1Node, hash2Node);
		});
	});
});
