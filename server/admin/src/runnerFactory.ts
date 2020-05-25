/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import { AdminRunner } from "./runner";
import { IWebServerFactory, WebServerFactory } from "./webServer";

export class AdminResources implements utils.IResources {
    public webServerFactory: IWebServerFactory;

    constructor(
        public config: Provider,
        public mongoManager: core.MongoManager,
        public port: any) {

        this.webServerFactory = new WebServerFactory();
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}

export class AdminResourcesFactory implements utils.IResourcesFactory<AdminResources> {
    public async create(config: Provider): Promise<AdminResources> {

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new core.MongoManager(mongoFactory);

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new AdminResources(
            config,
            mongoManager,
            port);
    }
}

export class AdminRunnerFactory implements utils.IRunnerFactory<AdminResources> {
    public async create(resources: AdminResources): Promise<utils.IRunner> {
        return new AdminRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.mongoManager);
    }
}
