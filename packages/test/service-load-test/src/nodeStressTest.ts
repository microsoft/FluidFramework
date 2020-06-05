/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { IProxyLoaderFactory, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { OdspDocumentServiceFactory, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import { LocalCodeLoader } from "@fluidframework/test-utils";

import { OdspTokenManager, odspTokensCache } from "@fluidframework/tool-utils";
import { pkgName, pkgVersion } from "./packageVersion";
import { IRunConfig, fluidExport, ILoadTest } from "./loadTestComponent";
const packageName = `${pkgName}@${pkgVersion}`;

// TODO: Make these parameters
const server = "a830edad9050849829E20060408.sharepoint.com";
const tenant = `https://${server}`;
const driveId = "b!o96WcQ93ck-dT5tlJfA7yZNP3Z9aM69JjJI6U4ASSXmZLLDGFcMBSqJ3iB3y04h0";

const runConfig: IRunConfig = {
    runId: 0,
    opRatePerMin: 15,
    progressInterval: 15000,
    numClients: 240,
    totalSendCount: 10000000,
};

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);
const urlResolver = new OdspDriverUrlResolver();

interface IClientConfig {
    clientId: string;
    clientSecret: string;
}
const getMicrosoftConfiguration = (): IClientConfig => ({
    get clientId() {
        if (process.env.login__microsoft__clientId === undefined) {
            throw new Error("Client ID environment variable not set: login__microsoft__clientId.");
        }
        return process.env.login__microsoft__clientId;
    },
    get clientSecret() {
        if (process.env.login__microsoft__secret === undefined) {
            throw new Error("Client Secret environment variable not set: login__microsoft__secret.");
        }
        return process.env.login__microsoft__secret;
    },
});

const odspTokenManager = new OdspTokenManager(odspTokensCache);

const fluidFetchWebNavigator = (url: string) => {
    let message = "Please open browser and navigate to this URL:";
    if (process.platform === "win32") {
        child_process.exec(`start "fluid-fetch" /B "${url}"`);
        message = "Opening browser to get authorization code.  If that doesn't open, please go to this URL manually";
    }
    console.log(`${message}\n  ${url}`);
};

function createLoader() {
    // Construct the loader
    const loader = new Loader(
        urlResolver,
        new OdspDocumentServiceFactory(
            async (siteUrl: string, refresh) => {
                const tokens = await odspTokenManager.getOdspTokens(
                    server, // REVIEW
                    getMicrosoftConfiguration(),
                    fluidFetchWebNavigator,
                    undefined,
                    undefined,
                    refresh,
                );
                return tokens.accessToken;
            },
            async (refresh: boolean) => {
                const tokens = await odspTokenManager.getPushTokens(
                    server,  // REVIEW
                    getMicrosoftConfiguration(),
                    fluidFetchWebNavigator,
                    undefined,
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

async function initialize() {
    const loader = createLoader();
    const container = await loader.createDetachedContainer(codeDetails);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const request = urlResolver.createCreateNewRequest(tenant, driveId, "/test", "test");
    await container.attach(request);
    const componentUrl = await container.getAbsoluteUrl("/");
    console.log(componentUrl);
    container.close();

    return componentUrl;
}

async function load(url: string) {
    const loader = createLoader();
    const respond = await loader.request({ url });
    // TODO: Error checking
    return respond.value as ILoadTest;
}

async function main() {
    // TODO: switch to use commander
    if (process.argv[2] === "--run") {
        if (process.argv[3] !== undefined && process.argv[4] !== undefined) {
            runConfig.runId = parseInt(process.argv[3], 10);
            const stressTest = await load(process.argv[4]);
            await stressTest.run(runConfig);
            process.exit(0);
        }
        console.error("Missing arguments for run");
        process.exit(-1);
    }

    let nextArg = process.argv[2];
    let componentUrl: string;
    if (process.argv[2] === "--spawn") {
        // Use a pre-existing file
        componentUrl = process.argv[3];
        nextArg = process.argv[4];
    }

    if (nextArg === "--refresh") {
        await odspTokenManager.getOdspTokens(
            server, // REVIEW
            getMicrosoftConfiguration(),
            fluidFetchWebNavigator,
            undefined,
            undefined,
            true,
        );

        await odspTokenManager.getPushTokens(
            server,  // REVIEW
            getMicrosoftConfiguration(),
            fluidFetchWebNavigator,
            undefined,
            undefined,
            true,
        );
    }

    if (componentUrl === undefined) {
        // Create a new file
        componentUrl = await initialize();
    }

    const p: Promise<void>[] = [];
    for (let i = 0; i < runConfig.numClients; i++) {
        const process = child_process.spawn(
            "node",
            ["dist\\nodeStressTest.js", "--run", i.toString(), componentUrl],
            { stdio: "inherit" },
        );
        p.push(new Promise((resolve) => process.on("close", resolve)));
    }
    await Promise.all(p);
    process.exit(0);
}

main().catch(
    (error) => {
        console.log(error);
    },
);
