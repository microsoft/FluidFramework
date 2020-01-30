/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from "commander";
import { configureLogging } from "./cliLogger";
import { PuppetMaster } from "./puppetMaster";

/**
 * This is for testing puppeteer from within the docker container (?)
 */

const tenantId = "fluid";

async function launchPuppeteer(documentId: string, agentType: string, gatewayUrl: string) {
    configureLogging({
        colorize: true,
        json: false,
        label: "winston",
        level: "info",
        timestamp: true,
    });

    const puppetMaster = await PuppetMaster.launch(
        documentId,
        tenantId,
        gatewayUrl,
        agentType);

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
