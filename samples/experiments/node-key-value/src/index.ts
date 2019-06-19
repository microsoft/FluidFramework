/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IPragueResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { NodeCodeLoader, NodePlatform } from "@prague/services";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as process from "process";
import * as url from "url";

interface IKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
}

function registerAttach(loader: Loader, container: Container, uri: string, platform: NodePlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

async function attach(loader: Loader, docUrl: string, platform: NodePlatform) {
    const response = await loader.request({ url: docUrl });
    if (response.status !== 200 || response.mimeType !== "prague/component") {
        return;
    }
    // Query for desired interface.
    const component = response.value as IComponent;
    const keyValue = component.query<IKeyValue>("IKeyValue");
    if (!keyValue) {
        return;
    }

    keyValue.set("key1", Math.floor(Math.random() * 100000).toString());
    keyValue.set("key2", Math.floor(Math.random() * 100000).toString());

    console.log(keyValue.get("key1"));
    console.log(keyValue.get("key2"));
    console.log("Done");
}

async function run(loader: Loader, docUrl: string, codePackage: string): Promise<void> {
    const loaderP = loader.resolve({ url: docUrl });
    ora.promise(loaderP, `Resolving...`);
    const container = await loaderP;
    const platform = new NodePlatform();
    registerAttach(loader, container, docUrl, platform);

    if (!container.existing) {
        await initializeChaincode(container, codePackage)
            .catch((error) => console.error("chaincode error", error));
    }
}

async function initializeChaincode(container: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }
    const quorum = container.getQuorum();
    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }
    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }
    console.log(`Code is ${quorum.get("code2")}`);
}

// Process command line input
let action = false;
commander
    .option("-d, --orderer [orderer]", "Orderer URL", "https://alfred.wu2-ppe.prague.office-int.com")
    .option("-h, --storage [storage]", "Storage URL", "https://historian.wu2-ppe.prague.office-int.com")
    .option("-t, --tenant [tenant]", "Tenant", "prague")
    .option("-s, --secret [secret]", "Secret", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .option("-p, --package [package]", "Package", "@chaincode/key-value@0.5.7917")
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        const jwtKey = "VBQyoGpEYrTn3XQPtXW3K8fFDd";
        const hostToken = jwt.sign(
            {
                user: "node-loader",
            },
            jwtKey);
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user: {id: "node-chatter"},
            },
            commander.secret);

        const documentUrl = `prague://${url.parse(commander.orderer).host}` +
            `/${encodeURIComponent(commander.tenant)}` +
            `/${encodeURIComponent(documentId)}`;

        const deltaStorageUrl = commander.orderer +
            `/deltas/${encodeURIComponent(commander.tenant)}/${encodeURIComponent(documentId)}`;

        const storageUrl =
            commander.storage +
            "/repos" +
            `/${encodeURIComponent(commander.tenant)}`;

        const resolved: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: commander.orderer,
                storageUrl,
            },
            tokens: { jwt: token },
            type: "prague",
            url: documentUrl,
        };

        const resolver = new ContainerUrlResolver(
            commander.orderer,
            hostToken,
            new Map([[documentUrl, resolved]]));

        const loader = new Loader(
            { resolver },
            new RouterliciousDocumentServiceFactory(),
            new NodeCodeLoader("https://packages.wu2.prague.office-int.com", "/tmp/chaincode", 60000),
            null);

        run(loader, documentUrl, commander.package)
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });

    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
