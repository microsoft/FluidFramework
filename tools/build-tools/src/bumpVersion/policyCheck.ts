/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { GitRepo } from "./gitRepo";
import { exec, fatal } from "./utils";

/**
 * Runs policy check in fix/resolution mode the apply any an necessary changes
 * Currently this should only apply assert short codes, but could apply
 * additional policies in the future
 * @param gitRepo - the git repo context to run policy check on
 */
 export async function runPolicyCheckWithFix(gitRepo: GitRepo){
    console.log("Running Policy Check with Resolution(fix)");
    await exec(
        `node ${path.join(__dirname, '..', 'repoPolicyCheck', 'repoPolicyCheck.js')} -r`,
        gitRepo.resolvedRoot,
        "policy-check:fix failed");

    // check for policy check violation
    const afterPolicyCheckStatus = await gitRepo.getStatus();
    if (afterPolicyCheckStatus !== "") {
        console.log("======================================================================================================");
        fatal(`Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`);
    }
}