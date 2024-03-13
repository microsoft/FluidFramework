/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import { GitRepo, getResolvedFluidRoot } from "@fluidframework/build-tools";
import { FeedsForPackages } from "../../src/commands/list";
import { Context } from "../../src/library";

describe("feeds", async () => {
	const resolvedRoot = await getResolvedFluidRoot();
	const gitRepo = new GitRepo(resolvedRoot);
	const branch = await gitRepo.getCurrentBranchName();

	const context = new Context(gitRepo, "microsoft/FluidFramework", branch);
	const config = context.rootFluidBuildConfig?.policy?.packageNames!;
	const packages = FeedsForPackages(context.packages, config);

	it("dev and build feed are mutually exclusive", () => {
		const dev = packages.get("internal-dev")?.map((p) => p.name);
		const build = packages.get("internal-build")?.map((p) => p.name);

		const hasDupes = build?.some((name) => {
			return dev?.includes(name);
		});

		expect(hasDupes).to.be.false;
	});
});
