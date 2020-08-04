/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import child_process from "child_process";
import commander from "commander";
import {
    IProxyLoaderFactory,
    IFluidCodeDetails,
    IDetachedContainerSource,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { OdspDocumentServiceFactory, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import { LocalCodeLoader } from "@fluidframework/test-utils";

import { OdspTokenManager, odspTokensCache, getMicrosoftConfiguration } from "@fluidframework/tool-utils";
import { pkgName, pkgVersion } from "./packageVersion";
import { ITestConfig, IRunConfig, fluidExport, ILoadTest } from "./loadTestComponent";
const packageName = `${pkgName}@${pkgVersion}`;

interface ITestConfigs {
    full: ITestConfig,
    mini: ITestConfig,
}

interface IConfig {
    server: string,
    driveId: string,
    profiles: ITestConfigs,
}

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const source: IDetachedContainerSource = {
    codeDetails,
    useSnapshot: false,
};

const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);
const urlResolver = new OdspDriverUrlResolver();
const odspTokenManager = new OdspTokenManager(odspTokensCache);

const fluidFetchWebNavigator = (url: string) => {
    let message = "Please open browser and navigate to this URL:";
    if (process.platform === "win32") {
        child_process.exec(`start "fluid-fetch" /B "${url}"`);
        message = "Opening browser to get authorization code.  If that doesn't open, please go to this URL manually";
    }
    console.log(`${message}\n  ${url}`);
};

function createLoader(config: IConfig) {
    // Construct the loader
    const loader = new Loader(
        urlResolver,
        new OdspDocumentServiceFactory(
            async (siteUrl: string, refresh) => {
                const tokens = await odspTokenManager.getOdspTokens(
                    config.server,
                    getMicrosoftConfiguration(),
                    fluidFetchWebNavigator,
                    undefined,
                    refresh,
                );
                return tokens.accessToken;
            },
            async (refresh: boolean) => {
                const tokens = await odspTokenManager.getPushTokens(
                    config.server,
                    getMicrosoftConfiguration(),
                    fluidFetchWebNavigator,
                    undefined,
                    refresh,
                );
                return tokens.accessToken;
            },
        ),
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>(),
    );
    return loader;
}

async function initialize(config: IConfig) {
    const loader = createLoader(config);
    const container = await loader.createDetachedContainer(source);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const tenant = `https://${config.server}`;
    const request = urlResolver.createCreateNewRequest(tenant, config.driveId, "/test", "test");
    await container.attach(request);
    const componentUrl = await container.getAbsoluteUrl("/");
    console.log(componentUrl);
    container.close();

    return componentUrl;
}

async function load(config: IConfig, url: string) {
    const loader = createLoader(config);
    const respond = await loader.request({ url });
    // TODO: Error checking
    return respond.value as ILoadTest;
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
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "full")
        .option("-u, --url <url>", "Load an existing data store rather than creating new")
        .option("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .option("-f, --refresh", "Refresh auth tokens")
        .option("-d, --debug", "Debug child processes via --inspect-brk")
        .parse(process.argv);

    const profile: string | undefined = commander.profile;
    let url: string | undefined = commander.url;
    const runId: number | undefined = commander.runId === undefined ? undefined : parseInt(commander.runId, 10);
    const refresh: true | undefined = commander.refresh;
    const debug: true | undefined = commander.debug;

    if (config.profiles[profile] === undefined) {
        console.error("Invalid --profile argument not found in testConfig.json profiles");
        process.exit(-1);
    }

    // When runId is specified, kick off a single test runner and exit when it's finished
    if (runId !== undefined) {
        if (url === undefined) {
            console.error("Missing --url argument needed to run child process");
            process.exit(-1);
        }
        const runConfig: IRunConfig = {
            runId,
            testConfig: config.profiles[profile],
        };
        const stressTest = await load(config, url);
        await stressTest.run(runConfig);
        process.exit(0);
    }

    // When runId is not specified, this is the orchestrator process which will spawn child test runners.

    if (refresh) {
        console.log("Refreshing tokens");
        await odspTokenManager.getOdspTokens(
            config.server,
            getMicrosoftConfiguration(),
            fluidFetchWebNavigator,
            undefined,
            undefined,
            true,
        );

        await odspTokenManager.getPushTokens(
            config.server,
            getMicrosoftConfiguration(),
            fluidFetchWebNavigator,
            undefined,
            undefined,
            true,
        );
    }

    if (url === undefined) {
        // Create a new file
        url = await initialize(config);
    }

    const p: Promise<void>[] = [];
    for (let i = 0; i < config.profiles[profile].numClients; i++) {
        const args = ["dist\\nodeStressTest.js", "--profile", profile, "--runId", i.toString(), "--url", url];
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
    },
);
