/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { ApiModel } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { transformApiModel, type Section } from "../index.js";

import { testDataDirectoryPath } from "./EndToEndTestUtilities.js";

// Callers of our APIs can supply a model built with their own versions of `@microsoft/api-extractor-model`.
// Even at the same package version, two copies get different nominal typing.
// The documenter must still recognize declared properties and events and, when requested, inherited ones.
describe("caller-provided API models", () => {
	let temporaryDirectory: string;
	let model: ApiModel;
	before(async () => {
		const require = createRequire(import.meta.url);
		const entry = require.resolve("@microsoft/api-extractor-model");
		const implementation = path.dirname(entry);
		temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "documenter-model-"));

		// Load the exact same version twice with independent constructors, as in two install trees.
		// Only the model implementation needs a copy; its dependencies can be shared.
		await cp(implementation, path.join(temporaryDirectory, "model"), { recursive: true });
		await symlink(
			path.resolve(implementation, "../../.."),
			path.join(temporaryDirectory, "node_modules"),
			"junction",
		);
		const foreign = require(
			path.join(temporaryDirectory, "model", path.basename(entry)),
		) as typeof import("@microsoft/api-extractor-model");
		model = new foreign.ApiModel();

		// If Node reused the documenter's constructor, a regression to `instanceof` would still pass.
		expect(model).not.to.be.instanceOf(ApiModel);
		model.loadPackage(
			path.join(testDataDirectoryPath, "simple-suite-test/test-suite-a.api.json"),
		);
	});
	after(async () => {
		if (temporaryDirectory !== undefined)
			await rm(temporaryDirectory, { recursive: true, force: true });
	});

	for (const enabled of [false, true]) {
		it(`keeps property and event summaries with inheritance ${enabled ? "enabled" : "omitted"}`, () => {
			const sectionsByType = new Map<string, Section[]>();

			// Inspect sections at the layout boundary: a transform can finish successfully yet silently
			// omit properties and events because it did not recognize the caller's declarations.
			transformApiModel({
				apiModel: model,
				...(enabled ? { includeInheritedMembers: true } : {}),
				defaultSectionLayout: (item, sections) => {
					if (sections !== undefined) {
						sectionsByType.set(item.getScopedNameWithinPackage(), sections);
					}
					return sections ?? [];
				},
			});
			const headings = (name: string): (string | undefined)[] =>
				(sectionsByType.get(name) ?? []).map((s) => s.heading?.title);

			// TestInterface declares these members itself. The derived interface can only get these
			// two tables by following its bases, so it checks a different code path when enabled.
			expect(headings("TestInterface")).to.include.members(["Properties", "Events"]);
			if (enabled) {
				expect(headings("TestInterfaceExtendingOtherInterfaces")).to.include.members([
					"Properties",
					"Events",
				]);
			}
		});
	}
});
