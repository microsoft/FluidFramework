/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable prefer-template */
import * as url from "url";
import { IBaseHostConfig } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { NodeCodeLoader, NodeWhiteList } from "@microsoft/fluid-server-services";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as uuid from "uuid/v4";
import * as winston from "winston";

const packageManagerUrl = "https://packages.wu2.prague.office-int.com";
const installLocation = "/tmp/chaincode";
const waitTimeoutMS = 60000;

interface ILoadParams {
    jwtKey: string;
    orderer: string;
    secret: string;
    storage: string;
    tenant: string;
    user: string;
    waitMSec: number;
    docId: string;
    proposal: {
        propose: boolean,
        package: string,
    }
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

async function runInternal(loader: Loader, docUrl: string, params: ILoadParams): Promise<void> {
    winston.info(`Resolving ${docUrl}`);
    const container = await loader.resolve({ url: docUrl });
    winston.info(`Resolved ${docUrl}`);
    await waitForFullConnection(container);
    winston.info(`Fully connected to ${docUrl}`);
    if (params.proposal.propose) {
        const codePackage: IFluidCodeDetails = {
            config: {
                "@fluid-example:cdn": packageManagerUrl,
            },
            package: params.proposal.package,
        };
        await initializeChaincode(container, codePackage);
        winston.info(`Proposed code`);
    }
}

async function run(loader: Loader, docUrl: string, params: ILoadParams) {
    return new Promise<void>((resolve, reject) => {
        const waitTimer = setTimeout(() => {
            clearTimeout(waitTimer);
            reject(`Timeout (${params.waitMSec} ms) expired while loading ${docUrl}`);
        }, params.waitMSec);

        runInternal(loader, docUrl, params).then(() => {
            clearTimeout(waitTimer);
            resolve();
        }, (err) => {
            clearTimeout(waitTimer);
            reject(err);
        });
    });
}

export async function testFluidService(config: Provider): Promise<void> {
    const params = config.get("loader") as ILoadParams;
    const documentId = params.docId.length > 0 ? params.docId : uuid();
    const hostToken = jwt.sign(
        {
            user: params.user,
        },
        params.jwtKey);
    const token = jwt.sign(
        {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId: params.tenant,
            user: {id: "node-chatter"},
        },
        params.secret);

    const documentUrl = `fluid://${url.parse(params.orderer).host}` +
        `/${encodeURIComponent(params.tenant)}` +
        `/${encodeURIComponent(documentId)}`;

    const deltaStorageUrl = params.orderer +
        `/deltas/${encodeURIComponent(params.tenant)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        params.storage +
        "/repos" +
        `/${encodeURIComponent(params.tenant)}`;

    const resolved: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: params.orderer,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: documentUrl,
    };

    const resolver = new ContainerUrlResolver(
        params.orderer,
        hostToken,
        new Map([[documentUrl, resolved]]));

    const hostConfig: IBaseHostConfig = {
        documentServiceFactory: new RouterliciousDocumentServiceFactory(),
        urlResolver: resolver,
    };

    const loader = new Loader(
        hostConfig.urlResolver,
        hostConfig.documentServiceFactory,
        new NodeCodeLoader(packageManagerUrl, installLocation, waitTimeoutMS, new NodeWhiteList()),
        config,
        {},
        new Map<string, IProxyLoaderFactory>(),
    );

    return run(loader, documentUrl, params);
}

async function initializeChaincode(container: Container, pkg?: IFluidCodeDetails): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = container.getQuorum();
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    winston.info(`Code is ${quorum.get("code")}`);
}
