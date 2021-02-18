/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import fs from "fs";
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    OdspDocumentServiceFactory,
    OdspDriverUrlResolver,
    createOdspCreateContainerRequest,
    OdspResourceTokenFetchOptions,
 } from "@fluidframework/odsp-driver";
import {
    OdspTokenConfig,
    OdspTokenManager,
    odspTokensCache,
    getMicrosoftConfiguration,
} from "@fluidframework/tool-utils";
import { IClientConfig } from "@fluidframework/odsp-doclib-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
    type: "password",
    username,
    password,
});

export interface IOdspConfig extends IClientConfig {
    server: string;
    driveId: string;
    username: string;
    directory: string;
}

export class OdspTestDriver implements ITestDriver {
    public static createFromEnv() {
        const config = JSON.parse(fs.readFileSync("./odspConfig.json", "utf-8")) as IOdspConfig;
        const password = process.env.fluid__odsp__password;
        assert(password, "Missing password");

        if (process.env.BUILD_BUILD_ID !== undefined) {
            config.directory = `${process.env.BUILD_BUILD_ID}/${config.directory}`;
        }

        return new OdspTestDriver(
            {
                ...config,
                ... getMicrosoftConfiguration(),
            },
            password,
        );
    }

    public readonly type = "odsp";
    public readonly version = pkgVersion;
    private readonly odspTokenManager = new OdspTokenManager(odspTokensCache);
    constructor(
        private readonly config: Readonly<IOdspConfig>,
        private readonly password: string) { }
    createContainerUrl(testId: string): string {
        throw new Error("Method not implemented.");
    }

    createDocumentServiceFactory(): IDocumentServiceFactory {
        return new OdspDocumentServiceFactory(
            async (options: OdspResourceTokenFetchOptions) => {
                const tokens = await this.odspTokenManager.getOdspTokens(
                    this.config.server,
                    this.config,
                    passwordTokenConfig(this.config.username, this.password),
                    options.refresh,
                );
                return tokens.accessToken;
            },
            async (options: OdspResourceTokenFetchOptions) => {
                const tokens = await this.odspTokenManager.getPushTokens(
                    this.config.server,
                    this.config,
                    passwordTokenConfig(this.config.username, this.password),
                    options.refresh,
                );
                return tokens.accessToken;
            },
        );
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
