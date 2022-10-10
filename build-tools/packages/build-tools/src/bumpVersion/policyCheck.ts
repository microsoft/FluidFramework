/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { Context } from "./context";
import { exec, fatal } from "./utils";

/**
 * Runs policy check in fix/resolution mode the apply any an necessary changes
 * Currently this should only apply assert short codes, but could apply
 * additional policies in the future
 * @param context - The git repo context to run policy check on
 */
export async function runPolicyCheckWithFix(context: Context) {
    console.log("Running Policy Check with Resolution(fix)");
    if (context.originalBranchName !== "main") {
        console.warn(
            "WARNING: Policy check fixes are not expected outside of main branch!  Make sure you know what you are doing.",
        );
    }

    await exec(
        `node ${path.join(__dirname, "..", "repoPolicyCheck", "repoPolicyCheck.js")} -r`,
        context.gitRepo.resolvedRoot,
        "policy-check:fix failed",
    );

    // check for policy check violation
    const afterPolicyCheckStatus = await context.gitRepo.getStatus();
    if (afterPolicyCheckStatus !== "") {
        console.log(
            "======================================================================================================",
        );
        fatal(
            `Policy check needed to make modifications. Please create PR for the changes and merge before retrying.\n${afterPolicyCheckStatus}`,
        );
    }
}
