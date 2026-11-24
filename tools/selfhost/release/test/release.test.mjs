/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const releaseSource = path.resolve(import.meta.dirname, "..");

function fixture(t) {
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "selfhost-release-test-")),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const selfhost = path.join(root, "tooling/tools/selfhost");
	const release = path.join(selfhost, "release");
	const azure = path.join(selfhost, "azure");
	const fluid = path.join(root, "fluid");
	const bin = path.join(root, "bin");
	for (const directory of [release, azure, fluid, bin]) {
		fs.mkdirSync(directory, { recursive: true });
	}
	assert.equal(spawnSync("git", ["init", "-q", fluid]).status, 0);
	for (const script of ["create-and-deploy-release.sh", "generate-release.sh", "lib.sh"]) {
		fs.copyFileSync(path.join(releaseSource, script), path.join(release, script));
	}
	const script = (filename, contents) => {
		fs.writeFileSync(filename, `#!/usr/bin/env bash\nset -eu\n${contents}\n`, {
			mode: 0o700,
		});
	};
	script(path.join(bin, "docker"), "exit 0");
	script(
		path.join(azure, "preflight-check.sh"),
		'echo preflight >> "$CALLS"; exit "${FAIL_PREFLIGHT:-0}"',
	);
	script(path.join(azure, "deploy.sh"), 'echo "deploy $*" >> "$CALLS"');
	script(
		path.join(release, "setup-build-registry.sh"),
		'echo registry >> "$CALLS"; echo mock.azurecr.io',
	);
	script(
		path.join(release, "pin-source.sh"),
		'mkdir -p "$RELEASE_ROOT/$RELEASE_ID"; echo source >> "$CALLS"; echo \'{}\' > "$RELEASE_ROOT/$RELEASE_ID/source.json"',
	);
	script(
		path.join(release, "build-images.sh"),
		'echo "build $FLUID_DIR" >> "$CALLS"; printf \'{"imageTag":"test-tag"}\' > "$RELEASE_ROOT/$RELEASE_ID/build.json"',
	);
	script(
		path.join(release, "pin-images.sh"),
		'echo images >> "$CALLS"; echo \'{}\' > "$RELEASE_ROOT/$RELEASE_ID/images.json"; if [ "${FAIL_IMAGES:-0}" = 1 ]; then exit 1; fi',
	);
	script(path.join(release, "validate-pinned-images.sh"), 'echo validate >> "$CALLS"');
	const params = path.join(root, "parameters.json");
	fs.writeFileSync(
		params,
		JSON.stringify({ fluidRepoDir: fluid, buildAcr: { name: "mock" } }),
	);
	const callsFile = path.join(root, "calls");
	fs.writeFileSync(callsFile, "");
	const artifacts = path.join(root, "artifacts");
	const run = (args = [], env = {}, command = "create-and-deploy-release.sh") =>
		spawnSync("bash", [path.join(release, command), ...args], {
			encoding: "utf8",
			env: {
				...process.env,
				FLUID_DIR: "",
				ACR_LOGIN_SERVER: "",
				RELEASE_ID: "",
				FLUID_REF: "",
				PATH: `${bin}${path.delimiter}${process.env.PATH}`,
				RELEASE_ROOT: artifacts,
				CALLS: callsFile,
				...env,
			},
		});
	return {
		root,
		fluid,
		params,
		artifacts,
		run,
		calls: () => fs.readFileSync(callsFile, "utf8").trim().split("\n"),
	};
}

test("combined path resolves fluidRepoDir, preflights before provisioning, and publishes a bundle", (t) => {
	const f = fixture(t);
	const result = f.run(["test-tag", "r1", "-p", f.params]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(f.calls().slice(0, 4), [
		"preflight",
		"registry",
		"source",
		`build ${f.fluid}`,
	]);
	assert.ok(f.calls().at(-1).startsWith("deploy r1 "));
	assert.deepEqual(fs.readdirSync(f.artifacts), ["r1"]);
	assert.ok(fs.existsSync(path.join(f.artifacts, "r1", "images.json")));
});

test("FLUID_DIR overrides the parameter checkout", (t) => {
	const f = fixture(t);
	const other = path.join(f.root, "override");
	assert.equal(spawnSync("git", ["init", "-q", other]).status, 0);
	const result = f.run(["test-tag", "r1", "-p", f.params], { FLUID_DIR: other });
	assert.equal(result.status, 0, result.stderr);
	assert.ok(f.calls().includes(`build ${other}`));
});

test("invalid or dirty checkout fails before provisioning or creating artifacts", (t) => {
	const f = fixture(t);
	fs.writeFileSync(path.join(f.fluid, "untracked.txt"), "keep");
	const result = f.run(["test-tag", "r1", "-p", f.params]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /tracked edits or untracked files/);
	assert.deepEqual(f.calls(), [""]);
	assert.equal(fs.existsSync(f.artifacts), false);
});

test("failed preflight does not build or provision anything", (t) => {
	const f = fixture(t);
	const result = f.run(["test-tag", "r1", "-p", f.params], { FAIL_PREFLIGHT: "1" });
	assert.notEqual(result.status, 0);
	assert.deepEqual(f.calls(), ["preflight"]);
	assert.equal(fs.existsSync(f.artifacts), false);
});

test("skip-preflight is warned about and forwarded to deployment", (t) => {
	const f = fixture(t);
	const result = f.run(["test-tag", "r1", "-p", f.params, "--skip-preflight"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /WARNING: --skip-preflight/);
	assert.equal(f.calls().includes("preflight"), false);
	assert.match(f.calls().at(-1), /--skip-preflight$/);
});

test("skip-build accepts just a release id and needs no build checkout", (t) => {
	const f = fixture(t);
	const result = f.run(["r1", "--skip-build", "-p", f.params], {
		FLUID_DIR: "/does/not/exist",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.equal(f.calls().length, 1);
	assert.match(f.calls()[0], /^deploy r1 /);
});

test("skip-deploy builds without deployment preflight or deployment", (t) => {
	const f = fixture(t);
	const result = f.run(["test-tag", "r1", "-p", f.params, "--skip-deploy"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(f.calls().includes("preflight"), false);
	assert.equal(
		f.calls().some((call) => call.startsWith("deploy ")),
		false,
	);
});

test("failed generation removes only its staging directory and allows the same id on retry", (t) => {
	const f = fixture(t);
	fs.mkdirSync(path.join(f.artifacts, "existing"), { recursive: true });
	fs.writeFileSync(path.join(f.artifacts, "existing", "keep"), "keep");
	const args = ["test-tag", "r1", "-p", f.params];
	assert.notEqual(f.run(args, { FAIL_IMAGES: "1" }).status, 0);
	assert.deepEqual(fs.readdirSync(f.artifacts), ["existing"]);
	assert.equal(fs.readFileSync(path.join(f.artifacts, "existing", "keep"), "utf8"), "keep");
	assert.equal(f.run(args).status, 0);
	assert.deepEqual(fs.readdirSync(f.artifacts).sort(), ["existing", "r1"]);
});

test("completed releases cannot be overwritten", (t) => {
	const f = fixture(t);
	const args = ["test-tag", "r1", "-p", f.params];
	assert.equal(f.run(args).status, 0);
	const original = fs.readFileSync(path.join(f.artifacts, "r1", "source.json"), "utf8");
	const result = f.run(args);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /already exists/);
	assert.equal(fs.readFileSync(path.join(f.artifacts, "r1", "source.json"), "utf8"), original);
});

test("invalid release ids and missing parameter arguments fail safely", (t) => {
	const f = fixture(t);
	for (const args of [
		["test-tag", "../outside", "-p", f.params],
		["test-tag", "r1", "-p"],
		["test-tag", "r1", "extra", "-p", f.params],
	]) {
		assert.notEqual(f.run(args).status, 0);
	}
	assert.deepEqual(f.calls(), [""]);
});
