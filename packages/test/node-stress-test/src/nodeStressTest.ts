/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import { IProxyLoaderFactory, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { OdspDocumentServiceFactory, OdspDriverUrlResolver } from "@fluidframework/odsp-driver";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";

import { OdspTokenManager, odspTokensCache } from "@fluidframework/tool-utils";

// TODO: Make this a parameter
const server = "a830edad9050849829E20060408.sharepoint.com";
const tenant = `https://${server}`;
const driveId = "b!o96WcQ93ck-dT5tlJfA7yZNP3Z9aM69JjJI6U4ASSXmZLLDGFcMBSqJ3iB3y04h0";

const packageName = "@fluid-internal/node-stress-test@0.1.0";

const wait = async (time: number) => new Promise((resolve) => setTimeout(resolve, time));

interface IStressTest {
    run(): Promise<void>;
}
class StressTestComponent extends PrimedComponent implements IStressTest {
    public static ComponentName = "StressTestComponent";
    private opCount = 0;

    protected async componentHasInitialized() {
        this.root.on("op", () => {
            if (++this.opCount % 1000 === 0) {
                console.log(`${process.argv[3]}> seen = ${this.opCount}`);
            }
        });
    }
    public async run() {
        for (let i = 0; i < 10000; i++) {
            if (i % 10 === 0) {
                await wait(500 + Math.random() * 1000);
            }
            if (i % 100 === 0) {
                console.log(`${process.argv[3]}> sent = ${i}`);
            }
            await this.runStep();
        }
    }
    public async runStep() {
        this.root.set(Math.floor(Math.random() * 32).toString(), Math.random());
    }

    public print() {
        console.log((this.context.hostRuntime as IContainerRuntime).isDocumentDirty());
        console.log(`Op count: ${this.opCount}`);
        this.root.forEach((value, key) => {
            console.log(key, value);
        });
    }
}

const StressTestComponentInstantiationFactory = new PrimedComponentFactory(
    StressTestComponent.ComponentName,
    StressTestComponent,
    [],
    {},
);

const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    StressTestComponent.ComponentName,
    new Map([[StressTestComponent.ComponentName, Promise.resolve(StressTestComponentInstantiationFactory)]]),
);

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
    const componentUrl = await urlResolver.getAbsoluteUrl(container.resolvedUrl, "/");
    console.log(componentUrl);
    container.close();

    return componentUrl;
}

async function load(url: string) {
    const loader = createLoader();
    const respond = await loader.request({ url });
    return respond.value as StressTestComponent;
}

async function main() {
    if (process.argv[2] === "--run") {
        if (process.argv[3] !== undefined && process.argv[4] !== undefined) {
            const stressTest = await load(process.argv[4]);
            await stressTest.run();
            stressTest.print();
            process.exit(0);
        }
    }
    const componentUrl = await initialize();
    const p: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
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
