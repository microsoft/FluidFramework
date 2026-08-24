/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// Verifies the layout tenant-admin.sh actually mounts into the Pod.
//
// The wrapper builds a ConfigMap whose keys are flat file names (ConfigMap keys cannot contain
// "/") and remaps them back to bin/ and src/ via the volume's items[].path. Nothing else is
// mounted: no package.json, no node_modules. If any module ever gains a bare-specifier import or
// relies on package.json, it would work in-repo and fail only once deployed -- so reproduce the
// mounted tree here and run the real CLI out of it.

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const { startStubServices } = require("./stubServices");

const execFileAsync = promisify(execFile);
const PKG_ROOT = path.join(__dirname, "..");
const WRAPPER = path.join(PKG_ROOT, "tenant-admin.sh");

/**
 * Derive the mounted layout from tenant-admin.sh itself rather than duplicating it here.
 * A hand-maintained copy would drift silently, which is exactly the failure this file exists to
 * catch: a module missing from the wrapper's mount list works in-repo and only dies in the
 * cluster with MODULE_NOT_FOUND.
 *
 * Returns [sourcePathRelativeToPkgRoot, mountedPath] pairs.
 */
function readMountedFilesFromWrapper() {
	const wrapper = fs.readFileSync(WRAPPER, "utf8");

	// `--from-file="$CLI_DIR/src/foo.js"` -> ConfigMap key is the basename.
	const fromFiles = [...wrapper.matchAll(/--from-file="\$CLI_DIR\/([^"]+)"/g)].map(
		(m) => m[1],
	);
	// items[] entries: { key: "foo.js", path: "src/foo.js" }
	const items = [
		...wrapper.matchAll(/\{\s*key:\s*"([^"]+)",\s*path:\s*"([^"]+)"\s*\}/g),
	].map((m) => ({ key: m[1], mounted: m[2] }));

	assert.ok(fromFiles.length > 0, "no --from-file entries found in the wrapper");
	assert.equal(
		fromFiles.length,
		items.length,
		"every --from-file entry needs a matching items[] mapping in tenant-admin.sh",
	);

	return fromFiles.map((source) => {
		const key = path.basename(source);
		const item = items.find((entry) => entry.key === key);
		assert.ok(item, `no items[] mapping for ConfigMap key "${key}"`);
		return [source, item.mounted];
	});
}

const MOUNTED_FILES = readMountedFilesFromWrapper();

function materializeMountedTree() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-admin-mount-"));
	for (const [source, mounted] of MOUNTED_FILES) {
		const target = path.join(root, mounted);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(PKG_ROOT, source), target);
	}
	return root;
}

test("ConfigMap key names are unique, so the flat->path remapping is unambiguous", () => {
	const keys = MOUNTED_FILES.map(([source]) => path.basename(source));
	assert.equal(
		new Set(keys).size,
		keys.length,
		"two mounted files share a basename; ConfigMap keys would collide",
	);
});

test("tenant-admin.sh mounts every module the CLI ships", () => {
	const declared = new Set(MOUNTED_FILES.map(([source]) => source));
	const actual = fs
		.readdirSync(path.join(PKG_ROOT, "src"))
		.filter((f) => f.endsWith(".js"))
		.map((f) => `src/${f}`);
	actual.push("bin/tenant-admin.js");
	for (const file of actual) {
		assert.ok(
			declared.has(file),
			`${file} exists but tenant-admin.sh does not mount it -- add a --from-file ` +
				"entry and a matching items[] mapping, or the Pod dies with MODULE_NOT_FOUND",
		);
	}
});

test("each mounted file lands at the path its require()s expect", () => {
	// A ConfigMap key remapped to the wrong path (src/ vs bin/, or a case change) resolves in
	// the repo but not in the Pod, so assert the mapping is identity against the real tree.
	for (const [source, mounted] of MOUNTED_FILES) {
		assert.equal(
			mounted,
			source,
			`tenant-admin.sh mounts ${source} at ${mounted}; the require() paths assume they match`,
		);
		assert.ok(
			fs.existsSync(path.join(PKG_ROOT, source)),
			`tenant-admin.sh mounts ${source}, which does not exist`,
		);
	}
});

test("the CLI runs from the mounted tree with no package.json or node_modules", async (t) => {
	const stub = await startStubServices();
	const root = materializeMountedTree();
	t.after(() => {
		stub.close();
		fs.rmSync(root, { recursive: true, force: true });
	});

	assert.equal(
		fs.existsSync(path.join(root, "package.json")),
		false,
		"the mounted tree must not contain package.json",
	);

	const { stdout } = await execFileAsync(process.execPath, [
		path.join(root, "bin", "tenant-admin.js"),
		"create",
		"contoso",
		"--contact",
		"owner@contoso.com",
		"--requestor",
		"admin@contoso.com",
		"--riddler-url",
		stub.baseUrl,
		"--gitrest-url",
		stub.baseUrl,
		"--storage-url",
		"http://gitrest",
		"--json",
	]);

	const result = JSON.parse(stdout);
	assert.equal(result.tenantId, "contoso");
	assert.equal(result.storage.url, "http://gitrest");
	assert.equal(result.customData.createdBy, "admin@contoso.com");
});

test("--json output from the mounted tree is parseable as a single JSON document", async (t) => {
	// The wrapper carries the kubectl exec stream straight back to the requester, so stdout must
	// be exactly one document with no extra lines from the CLI.
	const stub = await startStubServices();
	const root = materializeMountedTree();
	t.after(() => {
		stub.close();
		fs.rmSync(root, { recursive: true, force: true });
	});

	const { stdout, stderr } = await execFileAsync(process.execPath, [
		path.join(root, "bin", "tenant-admin.js"),
		"list",
		"--riddler-url",
		stub.baseUrl,
		"--gitrest-url",
		stub.baseUrl,
		"--json",
	]);
	assert.equal(stderr, "", "stderr must be empty so the exec result stays pure JSON");
	assert.deepEqual(JSON.parse(stdout), []);
});
