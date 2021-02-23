/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    OdspDocumentServiceFactory,
    OdspDriverUrlResolver,
    createOdspCreateContainerRequest,
    OdspResourceTokenFetchOptions,
    IOdspResolvedUrl,
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
import { IOdspTestConfigEntry, IOdspTestLoginInfo, loadConfig } from "./config";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

export interface IOdspTestDriverConfig extends IClientConfig, IOdspTestLoginInfo {
    directory: string;
}

export async function setupOdspConfig(config: IOdspTestConfigEntry) {
    const loginAccounts = process.env.login__odsp__test__accounts;
    assert(loginAccounts !== undefined, "Missing login__odsp__test__accounts");
    // Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
    const passwords: { [user: string]: string } = JSON.parse(loginAccounts);

    const tenants = config.tenants;

    if(Object.keys(passwords) !==
        Object.keys(tenants).map((t)=>tenants[t]?.username)) {
        console.log("we should have a password for every tenant");
    }

    const odspTokenManager = new OdspTokenManager(odspTokensCache);

    for(const loginName of Object.keys(tenants)) {
        const loginInfo: IOdspTestLoginInfo | undefined = tenants[loginName];
        assert(loginInfo, `No Login: ${loginName}`);

        const password = passwords[loginInfo.username];

        const odspTokens = await odspTokenManager.getOdspTokens(
            loginInfo.server,
            getMicrosoftConfiguration(),
            passwordTokenConfig(loginInfo.username, password),
            undefined /* forceRefresh */,
            true /* forceReauth */,
        );
        loginInfo.driveId =  await getDriveId(loginInfo.server, "", undefined, { accessToken: odspTokens.accessToken });
    }
}

export class OdspTestDriver implements ITestDriver {
    public static createFromEnv() {
        const loginAccounts = process.env.login__odsp__test__accounts;
        assert(loginAccounts !== undefined, "Missing login__odsp__test__accounts");
        // Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
        const passwords: { [user: string]: string } = JSON.parse(loginAccounts);

        const config = loadConfig();
        const tenant = config.odsp.tenants[Object.keys(config.odsp.tenants)[0]];
        assert(tenant);

        return this.create(
            tenant.username,
            passwords[tenant.username],
            tenant.server,
            tenant.driveId,
            new Date().toISOString().replace(/:/g, "."),
        );
    }

    public static create(username: string, password: string, server: string, driveId: string, directory: string) {
        const config: IOdspTestDriverConfig = {
            username,
            password,
            server,
            directory,
            ...getMicrosoftConfiguration(),
            driveId,
        };

        if (process.env.BUILD_BUILD_ID !== undefined) {
            config.directory = `${process.env.BUILD_BUILD_ID}/${config.directory}`;
        }

        return new OdspTestDriver(config);
    }

    public readonly type = "odsp";
    public readonly version = pkgVersion;
    private readonly odspTokenManager = new OdspTokenManager(odspTokensCache);
    private readonly urlResolver = new OdspDriverUrlResolver();
    constructor(private readonly config: Readonly<IOdspTestDriverConfig>) { }

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
        const resolvedUrl: IOdspResolvedUrl = {
            type: "fluid",
            siteUrl,
            driveId: driveItem.drive,
            itemId: driveItem.item,
            url: "",
            hashedDocumentId: "",
            endpoints: {
                snapshotStorageUrl: "",
                attachmentGETStorageUrl: "",
                attachmentPOSTStorageUrl: "",
            },
            tokens: {},
            fileName: "",
            summarizer: false,
        };
        return this.urlResolver.getAbsoluteUrl(resolvedUrl, "");
    }

    createDocumentServiceFactory(): IDocumentServiceFactory {
        return new OdspDocumentServiceFactory(
            this.getStorageToken.bind(this),
            this.getPushToken.bind(this),
        );
    }

    private async getStorageToken(options: OdspResourceTokenFetchOptions) {
        // This function can handle token request for any multiple sites. Where the test driver is for a specific site.
        const tokens = await this.odspTokenManager.getOdspTokens(
            new URL(options.siteUrl).hostname,
            this.config,
            passwordTokenConfig(this.config.username, this.config.password),
            options.refresh,
        );
        return tokens.accessToken;
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
        return this.urlResolver;
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
