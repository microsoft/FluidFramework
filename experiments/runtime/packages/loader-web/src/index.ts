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

interface ITarEntry {
    buffer: ArrayBuffer;
    blob: Blob;
    name: string;
    mode: string;
    uid: string;
    gid: string;
    size: number;
    mtime: number;
    checksum: number;
    type: string;
    linkname: string;
    ustarFormat: string;
    version: string;
    uname: string;
    gname: string;
    devmajor: number;
    devminor: number;
    namePrefix: string;
    getBlobUrl(): string;
    readAsJSON(): any;
    readAsString(): string;
}

class WebLoader implements ICodeLoader {
    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        const [, scope, name, version] = components;
        const url = `http://localhost:4873/${encodeURI(scope)}/${encodeURI(name)}/${encodeURI(version)}`;
        const details = await axios.get(url);

        const data = await axios.get<ArrayBuffer>(details.data.dist.tarball, { responseType: "arraybuffer"});
        const inflateResult = pako.inflate(new Uint8Array(data.data));
        const extractedFiles = await untar(inflateResult.buffer) as ITarEntry[];

        const pkg = new Map<string, ITarEntry>();
        for (const extractedFile of extractedFiles) {
            pkg.set(extractedFile.name, extractedFile);
        }

        if (!pkg.has("package/package.json")) {
            return Promise.reject("Not a valid npm module");
        }

        const textDecoder = new TextDecoder("utf-8");
        const packageJson = JSON.parse(textDecoder.decode(pkg.get("package/package.json").buffer)) as IPraguePackage;
        assert(packageJson.prague && packageJson.prague.browser);

        for (const bundle of packageJson.prague.browser.bundle) {
            const appended = `package/${bundle}`;
            if (!pkg.has(appended)) {
                return Promise.reject("browser entry point missing");
            }

            const file = textDecoder.decode(pkg.get(appended).buffer);

            // TODO using eval for now but likely will want to switch to a script import with a wrapped context
            // to isolate the code
            // tslint:disable-next-line:no-eval
            eval(file);
        }

        return window[packageJson.prague.browser.entrypoint];
    }
}

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
