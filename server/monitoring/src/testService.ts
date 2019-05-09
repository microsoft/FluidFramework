import { IPragueResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as url from "url";
import * as uuid from "uuid/v4";
import * as winston from "winston";
import { NullCodeLoader } from "./nullCodeLoader";

interface ILoadParams {
    jwtKey: string;
    orderer: string;
    secret: string;
    storage: string;
    tenant: string;
    user: string;
    waitMSec: number;
}

// Wait for the container to get fully connected.
async function waitForFullConnection(container: Container): Promise<void> {
    if (container.connected) {
        return;
    } else {
        return new Promise<void>((resolve, reject) => {
            container.once("connected", () => {
                resolve();
            });
        });
    }
}

async function runInternal(loader: Loader, docUrl: string): Promise<void> {
    winston.info(`Loading ${docUrl}`);
    const loaderP = loader.resolve({ url: docUrl });
    const container = await loaderP;
    winston.info(`Loaded ${docUrl}`);
    await waitForFullConnection(container);
    winston.info(`Fully connected to ${docUrl}`);
}

async function run(loader: Loader, docUrl: string, timeoutMS: number) {
    return new Promise<void>((resolve, reject) => {
        const waitTimer = setTimeout(() => {
            clearTimeout(waitTimer);
            reject(`Timeout (${timeoutMS} ms) expired while loading ${docUrl}`);
        }, timeoutMS);

        runInternal(loader, docUrl).then(() => {
            clearTimeout(waitTimer);
            resolve();
        }, (err) => {
            clearTimeout(waitTimer);
            reject(err);
        });
    });
}

export async function testPragueService(config: Provider): Promise<void> {
    const params = config.get("loader") as ILoadParams;
    const documentId = uuid();
    const hostToken = jwt.sign(
        {
            user: params.user,
        },
        params.jwtKey);
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write",
            tenantId: params.tenant,
            user: {id: "node-chatter"},
        },
        params.secret);

    const documentUrl = `prague://${url.parse(params.orderer).host}` +
        `/${encodeURIComponent(params.tenant)}` +
        `/${encodeURIComponent(documentId)}`;

    const deltaStorageUrl = params.orderer +
        `/deltas/${encodeURIComponent(params.tenant)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        params.storage +
        "/repos" +
        `/${encodeURIComponent(params.tenant)}`;

    const resolved: IPragueResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: params.orderer,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "prague",
        url: documentUrl,
    };

    const resolver = new ContainerUrlResolver(
        params.orderer,
        hostToken,
        new Map([[documentUrl, resolved]]));

    const loader = new Loader(
        { resolver },
        new RouterliciousDocumentServiceFactory(),
        new NullCodeLoader(),
        null);

    return run(loader, documentUrl, params.waitMSec);
}
