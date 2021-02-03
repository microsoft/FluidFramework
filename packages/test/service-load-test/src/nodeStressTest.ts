/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import child_process from "child_process";
import commander from "commander";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { OdspDocumentServiceFactory, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import {
    OdspTokenManager,
    odspTokensCache,
    getMicrosoftConfiguration,
    OdspTokenConfig,
} from "@fluidframework/tool-utils";
import { getAsync, getLoginPageUrl, getOdspScope, IOdspTokens } from "@fluidframework/odsp-doclib-utils";
import { pkgName, pkgVersion } from "./packageVersion";
import { ITestConfig, IRunConfig, fluidExport, ILoadTest } from "./loadTestDataStore";

const packageName = `${pkgName}@${pkgVersion}`;

interface ITestConfigs {
    full: ITestConfig;
    mini: ITestConfig;
}

interface IConfig {
    server: string;
    username: string;
    profiles: ITestConfigs;
}

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);
const urlResolver = new OdspDriverUrlResolver();
const odspTokenManager = new OdspTokenManager(odspTokensCache);

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

function createLoader(config: IConfig, password: string) {
    const documentServiceFactory = new OdspDocumentServiceFactory(
        async (_siteUrl: string, refresh: boolean, _claims?: string) => {
            const tokens = await odspTokenManager.getOdspTokens(
                config.server,
                getMicrosoftConfiguration(),
                passwordTokenConfig(config.username, password),
                refresh,
            );
            return tokens.accessToken;
        },
        async (refresh: boolean, _claims?: string) => {
            const tokens = await odspTokenManager.getPushTokens(
                config.server,
                getMicrosoftConfiguration(),
                passwordTokenConfig(config.username, password),
                refresh,
            );
            return tokens.accessToken;
        },
    );

    // Construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });
    return loader;
}

async function initialize(config: IConfig, driveId: string, password: string) {
    const loader = createLoader(config, password);
    const container = await loader.createDetachedContainer(codeDetails);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const tenant = `https://${config.server}`;
    const request = urlResolver.createCreateNewRequest(tenant, driveId, "/test", "test");
    await container.attach(request);
    const dataStoreUrl = await container.getAbsoluteUrl("/");
    console.log(dataStoreUrl);
    container.close();

    return dataStoreUrl;
}

async function load(config: IConfig, url: string, password: string) {
    const loader = createLoader(config, password);
    const respond = await loader.request({ url });
    // TODO: Error checking
    return respond.value as ILoadTest;
}

async function getDriveId(server: string, odspTokens: IOdspTokens): Promise<string> {
    const driveResponse = await getAsync(
        `https://${server}/_api/v2.1/drive`,
        { accessToken: odspTokens.accessToken },
    );

    const driveJson = await driveResponse.json();

    return driveJson.id as string;
}

async function main() {
    let config: IConfig;
    try {
        config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
    } catch (e) {
        console.error("Failed to read testConfig.json");
        console.error(e);
        process.exit(-1);
    }

    commander
        .version("0.0.1")
        .requiredOption("-w, --password <password>", "Password for username provided in testconfig.json")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "full")
        .option("-u, --url <url>", "Load an existing data store rather than creating new")
        .option("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .option("-d, --debug", "Debug child processes via --inspect-brk")
        .option("-di, --driveId", "Users SPO drive id")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .parse(process.argv);

    const password: string = commander.password;
    const profile: string = commander.profile;
    let url: string | undefined = commander.url;
    const runId: number | undefined = commander.runId === undefined ? undefined : parseInt(commander.runId, 10);
    const debug: true | undefined = commander.debug;
    const log: string | undefined = commander.log;
    let driveId: string | undefined = commander.driveId;

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (config.profiles[profile] === undefined) {
        console.error("Invalid --profile argument not found in testConfig.json profiles");
        process.exit(-1);
    }

    // When runId is specified, kick off a single test runner and exit when it's finished
    if (runId !== undefined) {
        try {
            if (url === undefined) {
                console.error("Missing --url argument needed to run child process");
                process.exit(-1);
            }
            const runConfig: IRunConfig = {
                runId,
                testConfig: config.profiles[profile],
            };
            const stressTest = await load(config, url, password);
            await stressTest.run(runConfig);
            console.log(`${runId.toString().padStart(3)}> exit`);
            process.exit(0);
        } catch (e) {
            console.error(`${runId.toString().padStart(3)}> error: loading test`);
            console.error(e);
            process.exit(-1);
        }
    }

    // When runId is not specified, this is the orchestrator process which will spawn child test runners.

    try {
        // Ensure fresh tokens here so the test runners have them cached
        const odspTokens = await odspTokenManager.getOdspTokens(
            config.server,
            getMicrosoftConfiguration(),
            passwordTokenConfig(config.username, password),
            undefined /* forceRefresh */,
            true /* forceReauth */,
        );
        await odspTokenManager.getPushTokens(
            config.server,
            getMicrosoftConfiguration(),
            passwordTokenConfig(config.username, password),
            undefined /* forceRefresh */,
            true /* forceReauth */,
        );

        if (!driveId) {
            // automatically determine driveId based on the server & user
            driveId = await getDriveId(config.server, odspTokens);
        }
    } catch (ex) {
        // Log the login page url in case the caller needs to allow consent for this app
        const loginPageUrl =
            getLoginPageUrl(
                false,
                config.server,
                getMicrosoftConfiguration(),
                getOdspScope(config.server),
                "http://localhost:7000/auth/callback",
            );

        console.log("You may need to allow consent for this app. Re-run the tool after allowing consent.");
        console.log(`Go here allow the app: ${loginPageUrl}`);

        throw ex;
    }

    if (url === undefined) {
        // Create a new file
        url = await initialize(config, driveId, password);
    }

    const p: Promise<void>[] = [];
    for (let i = 0; i < config.profiles[profile].numClients; i++) {
        const args = [
            "./dist/nodeStressTest.js",
            "--password", password,
            "--driveId", driveId,
            "--profile", profile,
            "--runId", i.toString(),
            "--url", url];
        if (debug) {
            const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
            args.unshift(`--inspect-brk=${debugPort}`);
        }
        const process = child_process.spawn(
            "node",
            args,
            { stdio: "inherit" },
        );
        p.push(new Promise((resolve) => process.on("close", resolve)));
    }
    await Promise.all(p);
    process.exit(0);
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
