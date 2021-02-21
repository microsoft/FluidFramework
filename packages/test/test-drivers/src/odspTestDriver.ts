/* eslint-disable @typescript-eslint/no-non-null-assertion */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { getDriveItemByRootFileName, IClientConfig } from "@fluidframework/odsp-doclib-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

interface IOdspTestLoginInfo {
    server: string;
    username: string;
    password: string;
}
export interface IOdspTestDriverConfig extends IClientConfig, IOdspTestLoginInfo {
    driveId: string;
    directory: string;
}

export class OdspTestDriver implements ITestDriver {
    public static createFromEnv() {
        const config: IOdspTestDriverConfig = {
            username: process.env.testuser!,
            password: process.env.testpwd!,
            server: process.env.testserver!,
            directory: new Date().toISOString().replace(/:/g, "."),
            ...getMicrosoftConfiguration(),
            driveId: process.env.testDriveId!,
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
