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

const groups = [
    {
        name: "client",
        include: ["packages/**"],
    },
    {
        name: "routerlicious",
        include: ["server/routerlicious/**"],
    },
    {
        name: "protocol-definitions",
        include: ["common/lib/protocol-definitions/**"],
    },
    {
        name: "driver-definitions",
        include: ["common/lib/driver-definitions/**"],
    },
    {
        name: "core-interfaces",
        include: ["common/lib/core-interfaces/**"],
        exclude: [],
    },
    {
        name: "container-definitions",
        include: ["common/lib/container-definitions/**"],
    },
    {
        name: "common-utils",
        include: ["common/lib/common-utils/**"],
    },
    {
        name: "common-definitions",
        include: ["common/lib/common-definitions/**"],
    },
];
validateRepo({packageGroups: groups, logForPackages }).catch((e) => console.log(e));
