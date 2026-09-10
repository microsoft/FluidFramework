/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// Verifies that tenant-admin's checked-in production bundle is complete and fits in a ConfigMap.

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const esbuild = require("esbuild");

const { startStubServices } = require("./stubServices");

const execFileAsync = promisify(execFile);
const PKG_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(PKG_ROOT, "..", "..", "..");
const BUNDLE = path.join(PKG_ROOT, "bundle", "tenant-admin.cjs");
const ENTRY_POINT = path.join(PKG_ROOT, "bin", "tenant-admin.js");
const WRAPPER = path.join(PKG_ROOT, "tenant-admin.sh");
const ROUTERLICIOUS_PACKAGE = path.join(REPO_ROOT, "server", "routerlicious", "package.json");
const COPYRIGHT_BANNER = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
`;

async function buildBundle() {
	const result = await esbuild.build({
		banner: { js: COPYRIGHT_BANNER },
		bundle: true,
		entryPoints: [ENTRY_POINT],
		format: "cjs",
		legalComments: "inline",
		minify: true,
		platform: "node",
		target: "node22",
		write: false,
	});
	assert.equal(result.outputFiles.length, 1);
	return result.outputFiles[0].contents;
}

test("Routerlicious has no tenant-admin authentication dependency", () => {
	const packageJson = JSON.parse(fs.readFileSync(ROUTERLICIOUS_PACKAGE, "utf8"));
	assert.equal(packageJson.dependencies?.["@azure/identity"], undefined);
});

test("tenant-admin.sh mounts only the self-contained bundle", () => {
	const wrapper = fs.readFileSync(WRAPPER, "utf8");
	assert.match(wrapper, /--from-file="\$BUNDLE"/);
	assert.doesNotMatch(
		wrapper,
		/--dry-run=client|-o yaml \| k apply/,
		"kubectl apply would copy the bundle into an annotation that exceeds its size limit",
	);
	assert.match(wrapper, /mountPath: "\/opt\/tenant-admin"/);
	assert.match(wrapper, /node \/opt\/tenant-admin\/tenant-admin\.cjs/);
	assert.doesNotMatch(wrapper, /\/usr\/src\/server\/tenant-admin/);
});

test("the checked-in bundle is current and fits in a ConfigMap", async () => {
	const expected = await buildBundle();
	const actual = fs.readFileSync(BUNDLE);

	assert.deepEqual(actual, Buffer.from(expected), "run 'pnpm build' and commit the updated bundle");
	assert.ok(actual.byteLength < 900 * 1024, `bundle is too large: ${actual.byteLength} bytes`);
});

test("the bundle runs without an external node_modules tree", async (t) => {
	const stub = await startStubServices();
	const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-admin-bundle-"));
	const isolatedBundle = path.join(isolatedRoot, "tenant-admin.cjs");
	fs.copyFileSync(BUNDLE, isolatedBundle);
	t.after(() => {
		stub.close();
		fs.rmSync(isolatedRoot, { recursive: true, force: true });
	});

	const { stdout, stderr } = await execFileAsync(process.execPath, [
		isolatedBundle,
		"list",
		"--riddler-url",
		stub.baseUrl,
		"--gitrest-url",
		stub.baseUrl,
		"--json",
	]);
	assert.equal(stderr, "");
	assert.deepEqual(JSON.parse(stdout), []);
});
