/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assert } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import { PnpmCatalogEditor, readPnpmCatalogs } from "../../library/pnpmCatalog.js";

describe("PnpmCatalogEditor", () => {
	let directory: string;
	let workspacePath: string;

	beforeEach(() => {
		directory = mkdtempSync(path.join(tmpdir(), "pnpm-catalog-"));
		workspacePath = path.join(directory, "pnpm-workspace.yaml");
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it("merges selected entries without deleting unselected entries or comments", () => {
		writeFileSync(
			workspacePath,
			[
				"packages: []",
				"catalogs:",
				"  typeTest-previous:",
				"    first-previous: npm:first@1.0.0 # Baseline.",
				"    unselected-previous: npm:unselected@1.0.0",
				"",
			].join("\n"),
		);
		const editor = new PnpmCatalogEditor(directory, "typeTest-previous");
		editor.updates.set("first-previous", "npm:first@2.0.0");
		editor.updates.set("new-previous", "npm:new@2.0.0");
		editor.save();
		assert.deepEqual(readPnpmCatalogs(directory).get("typeTest-previous"), {
			"first-previous": "npm:first@2.0.0",
			"unselected-previous": "npm:unselected@1.0.0",
			"new-previous": "npm:new@2.0.0",
		});
		assert.include(readFileSync(workspacePath, "utf8"), "# Baseline.");
	});

	it("preserves CRLF line endings", () => {
		writeFileSync(workspacePath, "# Workspace.\r\npackages: []\r\n");
		const editor = new PnpmCatalogEditor(directory, "typeTest-previous");
		editor.updates.set("first-previous", "npm:first@2.0.0");
		editor.save();
		const result = readFileSync(workspacePath, "utf8");
		assert.include(result, "# Workspace.\r\n");
		assert.notInclude(result.replace(/\r\n/g, ""), "\n");
	});

	it("does not create a catalog when there are no updates", () => {
		const content = "# Workspace.\npackages: []\n";
		writeFileSync(workspacePath, content);
		new PnpmCatalogEditor(directory, "typeTest-previous").save();
		assert.equal(readFileSync(workspacePath, "utf8"), content);
	});

	for (const content of [
		"packages: [",
		"- invalid",
		"catalogs: invalid\n",
		"catalogs:\n  typeTest-previous: []\n",
	]) {
		it(`rejects invalid workspace configuration '${JSON.stringify(content)}'`, () => {
			writeFileSync(workspacePath, content);
			assert.throws(() => new PnpmCatalogEditor(directory, "typeTest-previous"));
			assert.equal(readFileSync(workspacePath, "utf8"), content);
		});
	}

	it("reports missing workspace files instead of silently falling back", () => {
		assert.throws(() => new PnpmCatalogEditor(directory, "typeTest-previous"), "ENOENT");
	});
});
