/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYarnLock, parseNpmLock } from "../lockfiles.js";

// Test inputs follow these formats:
// - Yarn Classic: https://classic.yarnpkg.com/en/docs/yarn-lock
// - Yarn Berry (no formal specification): https://yarnpkg.com/protocols and
//   https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-core/sources/Project.ts
// - npm: https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json

test("Yarn Classic: grouped selectors, scoped aliases, deduplication, and local dependencies", () => {
	assert.deepEqual(
		parseYarnLock(`
# yarn lockfile v1
"semver@^5", "semver@~5.7":
  version "5.7.2"
  resolved "https://registry.yarnpkg.com/semver/-/semver-5.7.2.tgz"
"alias@npm:@scope/real@^1":
  version "1.2.3"
  resolved "https://registry.npmjs.org/@scope/real/-/real-1.2.3.tgz"
"semver@5.7.2":
  version "5.7.2"
  resolved "https://registry.npmjs.org/semver/-/semver-5.7.2.tgz"
"local@file:../local":
  version "1.0.0"
`),
		[
			{ name: "semver", version: "5.7.2" },
			{ name: "@scope/real", version: "1.2.3" },
		],
	);
});

test("Yarn Berry: npm locators use real names and workspace entries are excluded", () => {
	assert.deepEqual(
		parseYarnLock(`
__metadata:
  version: 8
"alias@npm:@scope/real@^1":
  version: 1.2.3
  resolution: "@scope/real@npm:1.2.3"
"project@workspace:.":
  version: 0.0.0-use.local
  resolution: "project@workspace:."
"external@https://example.com/source.tgz":
  version: 1.0.0
  resolution: "external@https://example.com/source.tgz"
`),
		[{ name: "@scope/real", version: "1.2.3" }],
	);
});

test("Yarn refuses malformed pins, syntax, and unsupported patched packages", () => {
	assert.throws(
		() =>
			parseYarnLock('# yarn lockfile v1\nx@^1:\n  version "bad"\n  resolved "https://x"\n'),
		/pin/,
	);
	assert.throws(() => parseYarnLock("x: [bad"), /./);
	assert.throws(
		() =>
			parseYarnLock(
				'"x@patch:x@npm:1#file":\n  version: 1.0.0\n  resolution: "x@patch:x@npm:1#file"\n',
			),
		/Patched/,
	);
});

test("npm v1: recursive dependencies, npm aliases, duplicates, and file/Git exclusions", () => {
	assert.deepEqual(
		parseNpmLock(
			JSON.stringify({
				lockfileVersion: 1,
				dependencies: {
					semver: { version: "5.7.2", dependencies: { nested: { version: "1.0.0" } } },
					alias: { version: "npm:@scope/real@1.2.3" },
					nested: { version: "1.0.0" },
					local: { version: "file:../local" },
					git: { version: "git+https://github.com/example/repo.git#abc" },
					resolvedGit: {
						version: "1.0.0",
						resolved: "git+https://github.com/example/repo.git#abc",
					},
				},
			}),
		),
		[
			{ name: "semver", version: "5.7.2" },
			{ name: "nested", version: "1.0.0" },
			{ name: "@scope/real", version: "1.2.3" },
		],
	);
});

test("npm v2/v3: packages map, nested scoped names, aliases, links, and workspace definitions", () => {
	for (const lockfileVersion of [2, 3]) {
		assert.deepEqual(
			parseNpmLock(
				JSON.stringify({
					lockfileVersion,
					packages: {
						"": { name: "private-root", version: "1.0.0" },
						"packages/workspace": { name: "workspace", version: "1.0.0" },
						"node_modules/workspace": { link: true, resolved: "packages/workspace" },
						"node_modules/foo/node_modules/@scope/bar": { version: "2.0.0" },
						"node_modules/alias": { name: "real", version: "1.0.0" },
						"node_modules/local": { version: "file:../local" },
					},
					dependencies: { stale: { version: "9.0.0" } },
				}),
			),
			[
				{ name: "@scope/bar", version: "2.0.0" },
				{ name: "real", version: "1.0.0" },
			],
		);
	}
});

test("npm rejects unsupported formats and malformed dependency pins", () => {
	assert.throws(() => parseNpmLock('{"lockfileVersion":4}'), /lockfileVersion/);
	assert.throws(() => parseNpmLock('{"lockfileVersion":3}'), /packages/);
	assert.throws(
		() => parseNpmLock('{"lockfileVersion":1,"dependencies":{"x":{}}}'),
		/Missing/,
	);
	assert.throws(
		() => parseNpmLock('{"lockfileVersion":1,"dependencies":{"x":{"version":"^1"}}}'),
		/pin/,
	);
});
