/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getResolvedFluidRoot } from "@fluidframework/build-tools";
import { expect } from "chai";
import { describe, it } from "mocha";

import { handlers } from "../../../library/repoPolicyCheck/pnpm.js";

describe("pnpm-npm-package-json-preinstall", () => {
	it("passes for a valid package.json with pnpm enforcement", async () => {
		const testDir = await mkdtemp(path.join(tmpdir(), "pnpm-policy-test-"));
		try {
			await mkdir(path.join(testDir, "scripts"));
			await writeFile(path.join(testDir, "scripts", "only-pnpm.cjs"), "");
			await writeFile(path.join(testDir, "pnpm-lock.yaml"), "");
			await writeFile(
				path.join(testDir, "package.json"),
				JSON.stringify({
					name: "test-package",
					scripts: {
						preinstall: "node scripts/only-pnpm.cjs",
					},
				}),
			);

			const handler = handlers.find(
				(current) => current.name === "pnpm-npm-package-json-preinstall",
			);
			expect(handler).to.not.equal(undefined);

			const result = await handler?.handler(
				path.join(testDir, "pnpm-lock.yaml"),
				await getResolvedFluidRoot(),
			);

			expect(result).to.equal(undefined);
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});
});
