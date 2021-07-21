/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import os from "os";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IDocumentServiceFactory,
    IUrlResolver,
 } from "@fluidframework/driver-definitions";
import type { OdspResourceTokenFetchOptions, HostStoragePolicy } from "@fluidframework/odsp-driver-definitions";
import {
    OdspTokenConfig,
    OdspTokenManager,
    odspTokensCache,
    getMicrosoftConfiguration,
} from "@fluidframework/tool-utils";
import {
    getDriveId,
    getDriveItemByRootFileName,
    IClientConfig,
} from "@fluidframework/odsp-doclib-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { OdspDriverApiType, OdspDriverApi } from "./odspDriverApi";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

export interface IOdspTestLoginInfo {
    server: string;
    username: string;
    password: string;
    supportsBrowserAuth?: boolean
}

type TokenConfig = IOdspTestLoginInfo & IClientConfig;

interface IOdspTestDriverConfig extends TokenConfig {
    directory: string;
    driveId: string;
    options: HostStoragePolicy | undefined
}

export class OdspTestDriver implements ITestDriver {
    // Share the tokens and driverId across multiple instance of the test driver
    private static readonly odspTokenManager = new OdspTokenManager(odspTokensCache);
    private static readonly driverIdPCache = new Map<string, Promise<string>>();
    private static async getDriveIdFromConfig(server: string, tokenConfig: TokenConfig): Promise<string> {
        const siteUrl = `https://${tokenConfig.server}`;
        try{
            return await getDriveId(server,"",undefined,
                {
                    accessToken: await this.getStorageToken({ siteUrl, refresh: false }, tokenConfig),
                    refreshTokenFn: async () => this.getStorageToken({ siteUrl, refresh: true }, tokenConfig),
                });
        }catch(ex) {
            if(tokenConfig.supportsBrowserAuth !== true) {
                throw ex;
            }
        }
        return getDriveId(
            server,"",undefined,
            {
                accessToken: await this.getStorageToken({ siteUrl, refresh: false, useBrowserAuth: true }, tokenConfig),
                refreshTokenFn:
                    async () => this.getStorageToken({ siteUrl, refresh: true, useBrowserAuth: true }, tokenConfig),
            });
    }

    public static async createFromEnv(
        config?: { directory?: string, username?: string, options?: HostStoragePolicy, supportsBrowserAuth?: boolean },
        api: OdspDriverApiType = OdspDriverApi,
    ) {
        const loginAccounts = process.env.login__odsp__test__accounts;
        assert(loginAccounts !== undefined, "Missing login__odsp__test__accounts");
        // Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
        const passwords: { [user: string]: string } = JSON.parse(loginAccounts);
        const username = config?.username ?? Object.keys(passwords)[0];
        assert(passwords[username], `No password for username: ${username}`);

        const emailServer = username.substr(username.indexOf("@") + 1);
        const server = `${emailServer.substr(0, emailServer.indexOf("."))}.sharepoint.com`;

        return this.create(
            {
                username,
                password: passwords[username],
                server,
                supportsBrowserAuth: config?.supportsBrowserAuth,
            },
            config?.directory ?? "",
            api,
            config?.options,
        );
    }

    private static async create(
        loginConfig: IOdspTestLoginInfo, directory: string, api = OdspDriverApi, options?: HostStoragePolicy) {
        const tokenConfig: TokenConfig = {
            ...loginConfig,
            ...getMicrosoftConfiguration(),
        };

        let driveIdP = this.driverIdPCache.get(loginConfig.server);
        if (!driveIdP) {
            driveIdP = this.getDriveIdFromConfig(loginConfig.server, tokenConfig);
        }

        const driveId = await driveIdP;
        const directoryParts = [directory];

        // if we are in a azure dev ops build use the build id in the dir path
        if (process.env.BUILD_BUILD_ID !== undefined) {
            directoryParts.push(process.env.BUILD_BUILD_ID);
        } else {
            directoryParts.push(os.hostname());
        }

        const driverConfig: IOdspTestDriverConfig = {
            ...tokenConfig,
            directory: directoryParts.join("/"),
            driveId,
            options,
        };

        return new OdspTestDriver(
            driverConfig,
            api,
        );
    }

    private static async getStorageToken(
        options: OdspResourceTokenFetchOptions & {useBrowserAuth?: boolean},
        config: IOdspTestLoginInfo & IClientConfig,
    ) {
        const hostname = new URL(options.siteUrl).hostname;
        if(options.useBrowserAuth === true) {
            const browserTokens = await this.odspTokenManager.getOdspTokens(
                hostname,
                config,
                {
                    type: "browserLogin",
                    navigator: (openUrl)=>{
                        // eslint-disable-next-line max-len
                        console.log(`Open the following url in a new private browser window, and login with user: ${config.username}`);
                        // eslint-disable-next-line max-len
                        console.log(`Additional account details may be available in the environment variable login__odsp__test__accounts`);
                        console.log(`"${openUrl}"`);
                    },
                },
                options.refresh,
            );
            return browserTokens.accessToken;
        }
        // This function can handle token request for any multiple sites.
        // Where the test driver is for a specific site.
        const tokens = await this.odspTokenManager.getOdspTokens(
            new URL(options.siteUrl).hostname,
            config,
            passwordTokenConfig(config.username, config.password),
            options.refresh,
        );
        return tokens.accessToken;
    }

    public readonly type = "odsp";
    public get version() { return this.api.version; }
    private readonly testIdToUrl = new Map<string, string>();
    private constructor(
        private readonly config: Readonly<IOdspTestDriverConfig>,
        private readonly api = OdspDriverApi) { }

    async createContainerUrl(testId: string): Promise<string> {
        if (!this.testIdToUrl.has(testId)) {
            const siteUrl = `https://${this.config.server}`;
            const driveItem = await getDriveItemByRootFileName(
                this.config.server,
                undefined,
                `/${this.config.directory}/${testId}.fluid`,
                {
                    accessToken: await this.getStorageToken({ siteUrl, refresh: false }),
                    refreshTokenFn: async () => this.getStorageToken({ siteUrl, refresh: false }),
                },
                true,
                this.config.driveId);

            this.testIdToUrl.set(
                testId,
                this.api.createOdspUrl({
                    ... driveItem,
                    siteUrl,
                    dataStorePath: "/",
                }));
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.testIdToUrl.get(testId)!;
    }

    createDocumentServiceFactory(): IDocumentServiceFactory {
        return new this.api.OdspDocumentServiceFactory(
            this.getStorageToken.bind(this),
            this.getPushToken.bind(this),
            undefined,
            this.config.options,
        );
    }

    createUrlResolver(): IUrlResolver {
        return new this.api.OdspDriverUrlResolver();
    }
    createCreateNewRequest(testId: string): IRequest {
        return this.api.createOdspCreateContainerRequest(
            `https://${this.config.server}`,
            this.config.driveId,
            this.config.directory,
            `${testId}.fluid`,
        );
    }

    private async getStorageToken(options: OdspResourceTokenFetchOptions) {
        return OdspTestDriver.getStorageToken(options, this.config);
    }
    private async getPushToken(options: OdspResourceTokenFetchOptions) {
        const tokens = await OdspTestDriver.odspTokenManager.getPushTokens(
            new URL(options.siteUrl).hostname,
            this.config,
            passwordTokenConfig(this.config.username, this.config.password),
            options.refresh,
        );

        return tokens.accessToken;
    }
}
