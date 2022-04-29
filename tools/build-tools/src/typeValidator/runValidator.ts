/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { bumpDependencies } from "../bumpVersion/bumpDependencies";
import { bumpVersionCommand } from "../bumpVersion/bumpVersion";
import { Context, VersionChangeType } from "../bumpVersion/context";
import { GitRepo } from "../bumpVersion/gitRepo";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { validateRepo } from "./repoValidator";
import { BreakingIncrement, enableLogging } from "./validatorUtils";

function incrementToVersionChangeType(increment: BreakingIncrement): VersionChangeType | undefined {
    switch (increment) {
        case BreakingIncrement.major:
            return "major";
        case BreakingIncrement.minor:
            return "minor";
    }
    return undefined;
}

async function main() {
    /**
     * argument parsing
     */
    program
        .option("-p|--packages <names...>", "Specific packages to validate, otherwise all")
        .option("-v|--verbose", "Verbose logging mode")
        .option("-b|--bump", "Bump versions for packages with breaking changes")
        .option("-d|--dep", "Bump consumers' dependencies on packages with breaking changes")
        .parse(process.argv);

    const includeOnly: Set<string> | undefined = program.packages ? new Set(program.packages) : undefined;
    if (program.verbose !== undefined) {
        enableLogging(true);
    }

    // Get validation results for the repo
    const validationResults = await validateRepo({ includeOnly });

    if (program.bump !== true && program.dep !== true) {
        return;
    }

    const resolvedRoot = await getResolvedFluidRoot();
    console.log(`Repo: ${resolvedRoot}`);
    const gitRepo = new GitRepo(resolvedRoot);
    const context = new Context(gitRepo, "github.com/microsoft/FluidFramework", await gitRepo.getCurrentBranchName());

    // Bump versions for packages with breaking changes if specified
    if (program.bump === true) {
        validationResults.forEach((value, key) => {
            const changeType = incrementToVersionChangeType(value.level);
            if (changeType !== undefined) {
                bumpVersionCommand(context, key, changeType, false, false);
                console.log(`Version for ${key} has been updated. Create a pre-release and update dependencies to consume it.`);
            }
        })
    }

    // Bump consumers' dependencies on packages with breaking changes if specified
    if (program.dep === true) {
        const depMap = new Map<string, undefined>();
        validationResults.forEach((value, key) => {
            depMap.set(key, undefined);
        });
        bumpDependencies(context, "Bump dependencies version", depMap, false, false, false);
    }
}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});
