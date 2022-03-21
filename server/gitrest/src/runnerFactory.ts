/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { Provider } from "nconf";
import * as services from "@fluidframework/server-services-shared";
import * as core from "@fluidframework/server-services-core";
import { normalizePort } from "@fluidframework/server-services-utils";
import { ExternalStorageManager } from "./externalStorageManager";
import { GitrestRunner } from "./runner";
import {
    IFileSystemManager,
    IRepositoryManagerFactory,
    IsomorphicGitManagerFactory,
    NodegitRepositoryManagerFactory,
} from "./utils";

export class GitrestResources implements core.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public readonly config: Provider,
        public readonly port: string | number,
        public readonly fileSystemManager: IFileSystemManager,
        public readonly repositoryManagerFactory: IRepositoryManagerFactory) {
        this.webServerFactory = new services.BasicWebServerFactory();
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class GitrestResourcesFactory implements core.IResourcesFactory<GitrestResources> {
    public async create(config: Provider): Promise<GitrestResources> {
        const port = normalizePort(process.env.PORT || "3000");
        const fileSystemManager = fs;
        const externalStorageManager = new ExternalStorageManager(config);
        const storageDirectory = config.get("storageDir");
        const gitLibrary: string | undefined = config.get("git:lib:name");
        const getRepositoryManagerFactory = () => {
            if (!gitLibrary || gitLibrary === "nodegit") {
                return new NodegitRepositoryManagerFactory(
                    storageDirectory,
                    fileSystemManager,
                    externalStorageManager,
                );
            } else if (gitLibrary === "isomorphic-git") {
                return new IsomorphicGitManagerFactory(
                    storageDirectory,
                    fileSystemManager,
                );
            }
            throw new Error("Invalid git library name.");
        };
        const repositoryManagerFactory = getRepositoryManagerFactory();

        return new GitrestResources(config, port, fileSystemManager, repositoryManagerFactory);
    }
}

export class GitrestRunnerFactory implements core.IRunnerFactory<GitrestResources> {
    public async create(resources: GitrestResources): Promise<core.IRunner> {
        return new GitrestRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.fileSystemManager,
            resources.repositoryManagerFactory);
    }
}
