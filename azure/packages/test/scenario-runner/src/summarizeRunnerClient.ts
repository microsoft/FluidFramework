/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { SummarizeRunner, SummarizeRunnerRunConfig } from "./SummarizeRunner";
import { ContainerFactorySchema } from "./interface";

async function main() {
    const parseIntArg = (value: any): number => {
        if (isNaN(parseInt(value, 10))) {
            throw new commander.InvalidArgumentError("Not a number.");
        }
        return parseInt(value, 10);
    };
    commander
        .version("0.0.1")
        .requiredOption("-s, --schema <schema>", "Container Schema")
        .requiredOption("-r, --runId <runId>", "orchestrator run id.")
        .requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
        .requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
        .requiredOption("-ct, --connType <connType>", "Connection type")
        .requiredOption("-ce, --connEndpoint <connEndpoint>", "Connection endpoint")
        .option(
            "-l, --log <filter>",
            "Filter debug logging. If not provided, uses DEBUG env variable.",
        )
        .requiredOption("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const config: SummarizeRunnerRunConfig = {
        runId: commander.runId,
        scenarioName: commander.scenarioName,
        childId: commander.childId,
        connType: commander.connType,
        connEndpoint: commander.connEndpoint,
        schema: JSON.parse(commander.schema) as ContainerFactorySchema,
    };

    if (commander.log !== undefined) {
        process.env.DEBUG = commander.log;
    }

    const id = await SummarizeRunner.execRun(config);

    process.send?.(id);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(-1);
});
