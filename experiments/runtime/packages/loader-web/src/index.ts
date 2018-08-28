import * as loader from "@prague/loader";
import {
    IChaincodeFactory,
    ICodeLoader,
    IDocumentService,
    IPraguePackage,
    ITokenService,
} from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import * as assert from "assert";
import axios from "axios";
import chalk from "chalk";
import untar from "js-untar";
import * as jwt from "jsonwebtoken";
import * as pako from "pako";
import * as queryString from "query-string";
import * as scriptjs from "scriptjs";

class WebLoader implements ICodeLoader {
    public load(pkg: IPraguePackage): Promise<IChaincodeFactory> {
        return new Promise<any>((resolve) => {
            assert(pkg.prague && pkg.prague.browser);
            scriptjs(pkg.prague.browser.bundle, () => resolve(window[pkg.prague.browser.entrypoint]));
        });
    }

    public async loadNpm(packageUrl: string): Promise<any> {
        const data = await axios.get<ArrayBuffer>(packageUrl, { responseType: "arraybuffer"});
        const inflateResult = pako.inflate(new Uint8Array(data.data));
        untar(inflateResult.buffer)
            .progress((extractedFile) => {
                console.log("Extract file!", JSON.stringify(extractedFile));
            })
            .then((extractedFiles) => {
                console.log(JSON.stringify(extractedFiles, null, 2));
            });

        return inflateResult;
    }
}

// {"prague":{"browser":{"entrypoint":"main","bundle":["http://localhost:8081/dist/main.bundle.js"]}}}

async function run(
    token: string,
    options: any,
    reject: boolean,
    documentServices: IDocumentService,
    tokenServices: ITokenService): Promise<void> {

    const webLoader = new WebLoader();
    const documentP = loader.load(
        token,
        null,
        documentServices,
        webLoader,
        tokenServices);
    const document = await documentP;

    // Test of doing direct NPM loading
    // webLoader.loadNpm("http://localhost:8080/dist/js-untar-0.1.0.tgz");

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
