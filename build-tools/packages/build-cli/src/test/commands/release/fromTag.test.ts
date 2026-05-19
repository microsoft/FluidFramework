/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Config } from "@oclif/core";
import { runCommand } from "@oclif/test";
import * as chai from "chai";
import { expect } from "chai";
import assertArrays from "chai-arrays";
import { describe, it } from "mocha";
import type { TaskOptions } from "simple-git";
import FromTagCommand from "../../../commands/release/fromTag.js";

chai.use(assertArrays);

describe("flub release fromTag", () => {
	// Test both against a mocked got repo, and the real one.
	// The real case, is skipped by default to avoid test failures in environments where the git repo is not present of the tags are not checked out.
	for (const mock of [true, false]) {
		// When mocking the git repo, pick a tag that does not (and will never) exist, to ensure mocking works.
		const tagOffset = mock ? 50 : 0;
		const previousVersion = `0.26.${tagOffset}`;
		const version = `0.26.${tagOffset + 1}`;
		const previousTag = `build-tools_v${previousVersion}`;
		const tag = `build-tools_v${version}`;
		const date = new Date("2023-10-26T19:35:13.000Z");

		const expected = {
			version,
			date,
			packageOrReleaseGroup: "build-tools",
			previousTag,
			previousVersion,
			releaseType: "patch",
			tag,
			title: `build-tools v${version} (patch)`,
		};

		// Mocha's skip functionality (via `this`) does not work with arrow functions.
		// eslint-disable-next-line prefer-arrow-callback
		it(`--json (Mock: ${mock})`, async function () {
			let output: Awaited<ReturnType<typeof FromTagCommand.run>>;
			if (mock) {
				const config = await Config.load({ root: import.meta.url });
				const command = new FromTagCommand([tag, "--json"], config);
				await command.init();
				const context = await command.getContext();
				const gitRepo = await context.getGitRepository();
				const simpleGit = gitRepo.gitClient;

				// Mock gitClient.tags to return a fixed set of build-tools tags, so the test
				// does not depend on git tags being present in the local checkout.
				simpleGit.tags = (async (options: TaskOptions = []) => {
					expect(options).to.deep.equal(["--list", "build-tools_v*"]);
					return {
						all: [previousTag, tag],
						latest: tag,
					};
				}) as unknown as (typeof simpleGit)["tags"];

				// Mock gitClient.show to return fixed commit dates for each tag.
				simpleGit.show = (async (options: TaskOptions = []) => {
					const tagDates: Record<string, Date> = {
						[tag]: date,
						// This date is not used, but we set it to a different value to ensure the command pulls the date from the correct tag.
						[previousTag]: new Date("2000-01-14T00:00:00.000Z"),
					};
					const queriedTag = (options as string[]).at(-1) ?? "";
					expect(options).to.deep.equal(["-s", "--format=%cI", queriedTag]);
					return tagDates[queriedTag]?.toISOString() ?? "";
				}) as unknown as (typeof simpleGit)["show"];

				output = await command.run();
			} else {
				// Skip real git test by default, as it requires specific tags to be present in the local repo, which may not be the case in all environments.
				// Disable this skip if you want to test against the actual git repo and tags.
				// this.skip();
				const { stdout } = await runCommand(["release:fromTag", tag, "--json"], {
					root: import.meta.url,
				});
				output = JSON.parse(stdout);
			}

			expect(JSON.stringify(output)).to.equal(JSON.stringify(expected));
		});
	}
});
