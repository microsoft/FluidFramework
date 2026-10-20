/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYarnLock } from "../lockfiles.js";

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
