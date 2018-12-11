import chalk from "chalk";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";

// Process command line input
let action = false;
commander
    .option("-t, --tenant [tenant]", "Tenant", "prague")
    .option("-s, --secret [secret]", "Secret", "43cfc3fbf04a97c0921fd23ff10f9e4b")
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