/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { TestOrchestrator } from "./TestOrchestrator";

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-c, --config <config>", "Yaml config to run", "v1")
        .parse(process.argv);
    const version: string = commander.config;
    const o = new TestOrchestrator({ version });
    await o.run().then(() => {
        console.log("TestOrchestrator: done");
        process.exit(0);
    });
}

main().catch((error) => {
    console.error("TestOrchestrator error:", error);
    process.exit(-1);
});
