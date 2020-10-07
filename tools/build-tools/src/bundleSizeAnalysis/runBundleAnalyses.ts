/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
// Run Danger to report the bundle analysis
// Do it this way through a script in build-tools instead of running Danger
// directly at the root of the repo because this better isolates its usage
// and dependencies
function main() {
    try {
        console.log(child_process.execSync(`npx danger ci -d ${__dirname}/dangerfile.js`).toString());
    } catch (e) {
        console.error(e.toString());
        process.exit(-1);
    }
}

main();
