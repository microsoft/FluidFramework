/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
	assertNoInternalRegistryReferences,
	findInternalRegistryReferences,
} from "../compatLockfile.js";

describe("compatibility lockfile registry", () => {
	it("accepts public npm registry metadata", () => {
		const lockfile =
			"resolution: {integrity: sha512-example}\n" +
			"tarball: https://registry.npmjs.org/example/-/example-1.0.0.tgz\n";

		assert.doesNotThrow(() => assertNoInternalRegistryReferences(lockfile));
		assert.deepStrictEqual(findInternalRegistryReferences(lockfile), []);
	});

	for (const registryUrl of [
		"https://packagefeedproxy.microsoft.io/npm/example",
		"https://ms-feed-2.pkgs.visualstudio.com/example",
		"https://pkgs.dev.azure.com/example/_packaging/npm/npm/registry/example",
		"https://dev.azure.com/example/_packaging/npm/npm/registry/example",
	]) {
		it(`rejects ${new URL(registryUrl).hostname}`, () => {
			const lockfile = `resolution: {tarball: ${registryUrl}}\n`;

			assert.throws(
				() => assertNoInternalRegistryReferences(lockfile),
				/microsoft-internal registry references.*line 1/is,
			);
		});
	}

	it("keeps the committed compatibility lockfile public-registry portable", () => {
		const lockfilePath = fileURLToPath(
			new URL("../../compat-workspaces/full/pnpm-lock.yaml", import.meta.url),
		);
		const lockfile = readFileSync(lockfilePath, "utf8");

		assertNoInternalRegistryReferences(lockfile, lockfilePath);
	});
});
