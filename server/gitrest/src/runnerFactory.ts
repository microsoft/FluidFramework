/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Provider } from "nconf";
import * as services from "@fluidframework/server-services-shared";
import * as core from "@fluidframework/server-services-core";
import { normalizePort } from "@fluidframework/server-services-utils";
import { ExternalStorageManager, IExternalStorageManager } from "./externalStorageManager";
import { GitrestRunner } from "./runner";

export class GitrestResources implements core.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public readonly config: Provider,
        public readonly port: string | number,
        public readonly externalStorageManager: IExternalStorageManager) {
        this.webServerFactory = new services.BasicWebServerFactory();
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class GitrestResourcesFactory implements core.IResourcesFactory<GitrestResources> {
    public async create(config: Provider): Promise<GitrestResources> {
        const port = normalizePort(process.env.PORT || "3000");
        const externalStorageManager = new ExternalStorageManager(config);

        return new GitrestResources(config, port, externalStorageManager);
    }
}

export class GitrestRunnerFactory implements core.IRunnerFactory<GitrestResources> {
    public async create(resources: GitrestResources): Promise<core.IRunner> {
        return new GitrestRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.externalStorageManager);
    }
}
