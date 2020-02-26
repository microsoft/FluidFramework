/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BlobServiceClient } from "@azure/storage-blob";
import * as commander from "commander";
import { AzureBlobService } from "../searchStorage";
import { configureLogging } from "./cliLogger";
import { PuppetMaster } from "./puppetMaster";

/**
 * This is for testing puppeteer from within the docker container (?)
 */

const tenantId = "fluid";
const authSecret = "VBQyoGpEYrTn3XQPtXW3K8fFDd";
// tslint:disable-next-line: max-line-length
const connectionString = "DefaultEndpointsProtocol=https;AccountName=searchhtml;AccountKey=+Yf1Ab6JmGu/VfSVyBs6pyD+fYE4KlVkpVOPwsdLFpSAXy2Ex6r1caeaMobVg5bFgAwlU59XfA9+SLckSIK0xA==;EndpointSuffix=core.windows.net";
const searchContainer = "localsearch";

async function launchPuppeteer(documentId: string, agentType: string, gatewayUrl: string) {
    configureLogging({
        colorize: true,
        json: false,
        label: "winston",
        level: "info",
        timestamp: true,
    });

    const blobServiceClient = await BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = await blobServiceClient.getContainerClient(searchContainer);
    const azureBlobService = new AzureBlobService(containerClient);

    const puppetMaster = await PuppetMaster.create(
        documentId,
        tenantId,
        gatewayUrl,
        agentType,
        authSecret,
        azureBlobService);

    return puppetMaster;
}

commander
    .version("0.0.1")
    .option(
        "-d, --document [document]",
        "Document to open",
        "test")
    .option(
        "-t, --type [type]",
        "Type of agent",
        "snapshot")
    .option(
        "-u, --gatewayUrl [gatewayUrl]",
        "GatewayUrl to Render against",
        "gateway")
    .parse(process.argv);

launchPuppeteer(commander.document, commander.type, commander.gatewayUrl).catch(
    (error) => {
        console.error(error);
        process.exit(1);
});
