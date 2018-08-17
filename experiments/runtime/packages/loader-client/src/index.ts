import * as loader from "@prague/loader";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import chalk from "chalk";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as process from "process";
import * as readline from "readline";

// tslint:disable-next-line:no-var-requires
const packageDetails = require("../package.json");

async function readlineAsync(input: readline.ReadLine, prompt: string): Promise<string> {
    return new Promise<string>((resolve) => {
        input.question(prompt, (answer) => resolve(answer));
    });
}

async function run(
    token: string,
    options: any,
    documentServices: IDocumentService,
    tokenServices: ITokenService): Promise<void> {
    const claims = tokenServices.extractClaims(token);

    const documentP = loader.load(token, null, documentServices, tokenServices);
    ora.promise(documentP, `Loading ${claims.tenantId}/${claims.documentId}`);
    const document = await documentP;

    const quorum = document.getQuorum();
    console.log(chalk.yellow("Initial clients"), chalk.bgBlue(JSON.stringify(Array.from(quorum.getMembers()))));
    quorum.on("addMember", (clientId, details) => console.log(chalk.bgBlue(`${clientId} joined`)));
    quorum.on("removeMember", (clientId) => console.log(chalk.bgBlue(`${clientId} left`)));
    quorum.on(
        "addProposal",
        (proposal) => {
            console.log(chalk.yellowBright(`Propose ${proposal.key}=${proposal.value}@${proposal.sequenceNumber}`));
        });
    quorum.on(
        "approveProposal",
        (sequenceNumber, key, value) => {
            console.log(chalk.green(`Approve ${key}=${value}@${sequenceNumber}`));
        });
    quorum.on(
        "rejectProposal",
        (sequenceNumber, key, value, rejections) => {
            console.log(chalk.red(`Reject ${key}=${value}@${sequenceNumber} by ${rejections}`));
        });

    console.log("");
    console.log("Begin entering proposals (ctrl+c to quit)");
    console.log("");

    const input = readline.createInterface(process.stdin, process.stdout);
    while (true) {
        const key = await readlineAsync(input, chalk.green("Key: "));
        const value = await readlineAsync(input, chalk.green("Value: "));

        const proposeP = quorum.propose(key, value);
        ora.promise(proposeP, `Proposing that ${key} = ${value}`);
    }
}

// Process command line input
let action = false;
commander
    .version(packageDetails.version)
    .option("-u, --deltas [deltas]", "Deltas URL", "http://localhost:3000")
    .option("-u, --snapshots [snapshots]", "Snapshots URL", "http://localhost:3001")
    .option("-u, --tenant [tenant]", "Tenant", "prague")
    .option("-u, --secret [secret]", "Secret", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        const tokenServices = new driver.TokenService();
        const documentServices = driver.createDocumentService(commander.deltas, commander.snapshots);
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user: { id: "loader-client" },
            },
            commander.secret);

        run(token, null, documentServices, tokenServices).catch((error) => {
            console.error(error);
            process.exit(1);
        });
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
