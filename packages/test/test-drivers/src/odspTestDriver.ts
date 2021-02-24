/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import os from "os";
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    OdspDocumentServiceFactory,
    createOdspCreateContainerRequest,
    OdspResourceTokenFetchOptions,
    createOdspUrl,
    OdspDriverUrlResolver,
} from "@fluidframework/odsp-driver";
import {
    OdspTokenConfig,
    OdspTokenManager,
    odspTokensCache,
    getMicrosoftConfiguration,
} from "@fluidframework/tool-utils";
import { getDriveId, getDriveItemByRootFileName, IClientConfig } from "@fluidframework/odsp-doclib-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

export interface IOdspTestLoginInfo {
    server: string;
    username: string;
    password: string;
}

type TokenConfig = IOdspTestLoginInfo & IClientConfig;

interface IOdspTestDriverConfig extends TokenConfig{
    directory: string;
    driveId: string;
}

export class OdspTestDriver implements ITestDriver {
    public static async createFromEnv(
        config?: {directory?: string, username?: string},
    ) {
        const loginAccounts = process.env.login__odsp__test__accounts;
        assert(loginAccounts !== undefined, "Missing login__odsp__test__accounts");
        // Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
        const passwords: { [user: string]: string } = JSON.parse(loginAccounts);
        const username = config?.username ?? Object.keys(passwords)[0];
        assert(passwords[username], `No password for username: ${username}`);

        const emailServer = username.substr(username.indexOf("@") + 1);
        const server = `${emailServer.substr(0, emailServer.indexOf("."))}.sharepoint.com`;

        return this.create({
                username,
                password: passwords[username],
                server,
            },
            config?.directory ?? "",
        );
    }

    public static  async create(loginConfig: IOdspTestLoginInfo, directory: string = "") {
        const tokenConfig: TokenConfig = {
            ... loginConfig,
            ...getMicrosoftConfiguration(),
        };
        const odspTokenManager = new OdspTokenManager(odspTokensCache);
        const siteUrl = `https://${tokenConfig.server}`;
        const driveId = await getDriveId(
            loginConfig.server,
            "",
            undefined,
            { accessToken: await this.getStorageToken({ siteUrl, refresh: false }, odspTokenManager, tokenConfig) });

        const directoryParts = [directory];

        if (process.env.BUILD_BUILD_ID !== undefined) {
            directoryParts.push(process.env.BUILD_BUILD_ID);
        }else{
            directoryParts.push(os.hostname());
        }

        const driverConfig: IOdspTestDriverConfig = {
            ... tokenConfig,
            directory: directoryParts.join("/"),
            driveId,
        };

        return new OdspTestDriver(
            odspTokenManager,
            driverConfig);
    }

    private static async getStorageToken(
        options: OdspResourceTokenFetchOptions,
        odspTokenManager: OdspTokenManager,
        config: IOdspTestLoginInfo & IClientConfig) {
        // This function can handle token request for any multiple sites. Where the test driver is for a specific site.
        const tokens = await odspTokenManager.getOdspTokens(
            new URL(options.siteUrl).hostname,
            config,
            passwordTokenConfig(config.username, config.password),
            options.refresh,
        );
        return tokens.accessToken;
    }

    public readonly type = "odsp";
    public readonly version = pkgVersion;
    private constructor(
        private readonly odspTokenManager: OdspTokenManager,
        private readonly config: Readonly<IOdspTestDriverConfig>) { }

    async createContainerUrl(testId: string): Promise<string> {
        const siteUrl = `https://${this.config.server}`;
        const driveItem = await getDriveItemByRootFileName(
            this.config.server,
            undefined,
            `/${this.config.directory}/${testId}.fluid`,
            {
                accessToken: await this.getStorageToken({ siteUrl, refresh: false }),
                refreshTokenFn: async () => this.getStorageToken({ siteUrl, refresh: true }),
            },
            false,
            this.config.driveId);

        return createOdspUrl(
            siteUrl,
            driveItem.drive,
            driveItem.item,
            "/");
    }

    createDocumentServiceFactory(): IDocumentServiceFactory {
        return new OdspDocumentServiceFactory(
            this.getStorageToken.bind(this),
            this.getPushToken.bind(this),
        );
    }

    private async getStorageToken(options: OdspResourceTokenFetchOptions) {
        return OdspTestDriver.getStorageToken(options, this.odspTokenManager, this.config);
    }
    private async getPushToken(options: OdspResourceTokenFetchOptions) {
        const tokens = await this.odspTokenManager.getPushTokens(
            new URL(options.siteUrl).hostname,
            this.config,
            passwordTokenConfig(this.config.username, this.config.password),
            options.refresh,
        );

        return tokens.accessToken;
    }
    createUrlResolver(): IUrlResolver {
        return new OdspDriverUrlResolver();
    }
    createCreateNewRequest(testId: string): IRequest {
        return createOdspCreateContainerRequest(
            `https://${this.config.server}`,
            this.config.driveId,
            this.config.directory,
            `${testId}.fluid`,
        );
    }
}
