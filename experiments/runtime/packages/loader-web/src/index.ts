import * as loader from "@prague/loader";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import chalk from "chalk";
import * as jwt from "jsonwebtoken";
import * as queryString from "query-string";

console.log("HI");

async function run(
    token: string,
    options: any,
    reject: boolean,
    documentServices: IDocumentService,
    tokenServices: ITokenService): Promise<void> {

    const documentP = loader.load(token, null, documentServices, tokenServices);
    const document = await documentP;

    const quorum = document.getQuorum();
    console.log(chalk.yellow("Initial clients"), chalk.bgBlue(JSON.stringify(Array.from(quorum.getMembers()))));
    quorum.on("addMember", (clientId, details) => console.log(chalk.bgBlue(`${clientId} joined`)));
    quorum.on("removeMember", (clientId) => console.log(chalk.bgBlue(`${clientId} left`)));
    quorum.on(
        "addProposal",
        (proposal) => {
            if (reject) {
                console.log(chalk.redBright(`Reject ${proposal.key}=${proposal.value}@${proposal.sequenceNumber}`));
                proposal.reject();
            } else {
                console.log(chalk.yellowBright(`Propose ${proposal.key}=${proposal.value}@${proposal.sequenceNumber}`));
            }
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
}

function start() {
    const deltas = "http://localhost:3000";
    const historian = "http://localhost:3001";
    const tenant = "prague";
    const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

    const params = queryString.parse(window.location.search);
    const documentId = params.documentId ? params.documentId : "hello-world";

    const tokenServices = new driver.TokenService();
    const documentServices = driver.createDocumentService(deltas, historian);
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write",
            tenantId: tenant,
            user: { id: "loader-web" },
        },
        secret);

    run(token, null, false, documentServices, tokenServices).catch((error) => {
        console.error(error);
    });
}

start();
