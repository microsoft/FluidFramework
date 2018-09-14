import { ICommit } from "@prague/gitresources";
import * as loader from "@prague/loader";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import chalk from "chalk";
import { WebLoader } from "./webLoader";
import { WebPlatform } from "./webPlatform";

async function proposeChaincode(document: loader.Document, chaincode: string) {
    if (!document.connected) {
        await new Promise<void>((resolve) => document.once("connected", () => resolve()));
    }

    await document.getQuorum().propose("code", chaincode);
}

export async function run(
    token: string,
    options: any,
    reject: boolean,
    documentServices: IDocumentService,
    tokenServices: ITokenService,
    version: ICommit,
    connect: boolean,
    chaincode: string,
    loaderUrl: string): Promise<void> {

    const webLoader = new WebLoader(loaderUrl);
    const webPlatform = new WebPlatform(window.document.getElementById("content"));

    const documentP = loader.load(
        token,
        null,
        webPlatform,
        documentServices,
        webLoader,
        tokenServices,
        version,
        connect);
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

    // Propose initial chaincode if specified
    if (chaincode) {
        proposeChaincode(document, chaincode).catch((error) => console.error("Error installing chaincode"));
    }
}
