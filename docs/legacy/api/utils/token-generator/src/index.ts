/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";

// Process command line input
let action = false;
commander
    .option("-t, --tenant [tenant]", "Tenant", "stupefied-kilby")
    .option("-s, --secret [secret]", "Secret", "4a9211594f7c3daebca3deb8d6115fe2")
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        const user = { id: "rest-client" };
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user,
            },
            commander.secret);
        console.log(chalk.green(`${token}`));
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}