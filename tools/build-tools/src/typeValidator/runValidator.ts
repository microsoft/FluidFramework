/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { validateRepo } from "./repoValidator";
import { enableLogging } from "./validatorUtils";

/**
 * argument parsing
 */
program
    .option("-p|--packages <names...>", "Specific packages to output info, otherwise all")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

const logForPackages: Set<string> | undefined = new Set(program.packages);
if (program.verbose !== undefined) {
    enableLogging(true);
}

validateRepo({ logForPackages }).catch((e) => console.log(e));
