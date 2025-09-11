/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { readFilePartial } from "../../../library/repoPolicyCheck/common.js";
import { handlers } from "../../../library/repoPolicyCheck/copyrightFileHeader.js";

describe("copyright-file-header", () => {
	let testDir: string;
	const testFiles: string[] = [];

	before(() => {
		// Create a temporary directory for test files
		testDir = fs.mkdtempSync("copyright-test-");
	});

	after(() => {
		// Clean up test files
		for (const file of testFiles) {
			try {
				fs.unlinkSync(file);
			} catch {
				// ignore cleanup errors
			}
		}
		try {
			fs.rmdirSync(testDir);
		} catch {
			// ignore cleanup errors
		}
	});

	describe("readFilePartial", () => {
		it("reads only the first portion of a file", () => {
			const testFile = path.join(testDir, "partial-test.txt");
			const content = "0123456789".repeat(100); // 1000 characters
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const partial = readFilePartial(testFile, 100);
			expect(partial).to.have.length(100);
			expect(partial).to.equal("0123456789".repeat(10));
		});

		it("handles files smaller than the byte limit", () => {
			const testFile = path.join(testDir, "small-test.txt");
			const content = "small file content";
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const partial = readFilePartial(testFile, 1000);
			expect(partial).to.equal(content);
		});

		it("uses default 512 byte limit", () => {
			const testFile = path.join(testDir, "default-test.txt");
			const content = "x".repeat(1000);
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const partial = readFilePartial(testFile);
			expect(partial).to.have.length(512);
		});
	});

	describe("copyright header detection", () => {
		it("detects valid JavaScript/TypeScript copyright header", async () => {
			const testFile = path.join(testDir, "valid.ts");
			const content = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const test = "value";
${"// ".repeat(1000)}`; // Add lots of content to test partial reading
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const handler = handlers.find(h => h.name === "js-ts-copyright-file-header");
			if (!handler) {
				throw new Error("Handler not found");
			}

			const result = await handler.handler(testFile, "");
			expect(result).to.be.undefined; // No error means valid header
		});

		it("detects missing JavaScript/TypeScript copyright header", async () => {
			const testFile = path.join(testDir, "invalid.ts");
			const content = `export const test = "value";
${"// ".repeat(1000)}`; // Add lots of content to test partial reading
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const handler = handlers.find(h => h.name === "js-ts-copyright-file-header");
			if (!handler) {
				throw new Error("Handler not found");
			}

			const result = await handler.handler(testFile, "");
			expect(result).to.equal("JavaScript/TypeScript file missing copyright header");
		});

		it("detects valid HTML copyright header", async () => {
			const testFile = path.join(testDir, "valid.html");
			const content = `<!-- Copyright (c) Microsoft Corporation and contributors. All rights reserved. -->
<!-- Licensed under the MIT License. -->

<html>
<body>
${"<!-- content -->".repeat(1000)}
</body>
</html>`;
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const handler = handlers.find(h => h.name === "html-copyright-file-header");
			if (!handler) {
				throw new Error("Handler not found");
			}

			const result = await handler.handler(testFile, "");
			expect(result).to.be.undefined; // No error means valid header
		});

		it("works with large files due to partial reading optimization", async () => {
			const testFile = path.join(testDir, "large.ts");
			const header = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

`;
			const largeContent = "// ".repeat(100000); // Very large file
			const content = header + largeContent;
			fs.writeFileSync(testFile, content);
			testFiles.push(testFile);

			const handler = handlers.find(h => h.name === "js-ts-copyright-file-header");
			if (!handler) {
				throw new Error("Handler not found");
			}

			const startTime = Date.now();
			const result = await handler.handler(testFile, "");
			const endTime = Date.now();

			expect(result).to.be.undefined; // No error means valid header
			// The test should complete quickly since we're only reading the first 512 bytes
			expect(endTime - startTime).to.be.lessThan(100); // Should be very fast
		});
	});
});