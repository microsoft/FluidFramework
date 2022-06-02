/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { E_TIMEOUT, Mutex, MutexInterface, withTimeout } from "async-mutex";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IExternalStorageManager } from "../externalStorageManager";
import * as helpers from "./helpers";
import {
    IRepositoryManagerFactory,
    IRepositoryManager,
    IFileSystemManager,
    IFileSystemManagerFactory,
    IRepoManagerParams,
    IStorageDirectoryConfig,
    BaseGitRestTelemetryProperties,
    Constants,
} from "./definitions";

export abstract class RepositoryManagerFactoryBase<TRepo> implements IRepositoryManagerFactory {
    // Cache repositories to allow for reuse
    private readonly repositoryCache = new Map<string, TRepo>();
    // Map each mutex to one repo. We don't want to block concurrent requests on the mutex if
    // the requests are meant for different repos.
    private readonly mutexes = new Map<string, MutexInterface>();
    private readonly internalHandler: (
        params: IRepoManagerParams,
        onRepoNotExists: (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => Promise<void> | never,
        shouldUseMutex: boolean) => Promise<IRepositoryManager>;
    protected abstract initGitRepo(fs: IFileSystemManager, gitdir: string): Promise<TRepo>;
    protected abstract openGitRepo(gitdir: string): Promise<TRepo>;
    protected abstract createRepoManager(
        fileSystemManager: IFileSystemManager,
        repoOwner: string,
        repoName: string,
        repo: TRepo,
        gitdir: string,
        externalStorageManager: IExternalStorageManager,
        lumberjackBaseProperties: Record<string, any>): IRepositoryManager;

    constructor(
        private readonly storageDirectoryConfig: IStorageDirectoryConfig,
        private readonly fileSystemManagerFactory: IFileSystemManagerFactory,
        private readonly externalStorageManager: IExternalStorageManager,
        repoPerDocEnabled: boolean,
    ) {
        if (repoPerDocEnabled) {
            this.internalHandler = this.repoPerDocInternalHandler.bind(this);
        } else {
            this.internalHandler = this.repoPerTenantInternalHandler.bind(this);
        }
    }

    public async create(params: IRepoManagerParams): Promise<IRepositoryManager> {
        const onRepoNotExists = async (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => {
            // Create and then cache the repository
            const repository = await this.initGitRepo(fileSystemManager, gitdir);
            this.repositoryCache.set(repoPath, repository);
            Lumberjack.info(
                "Created a new repo",
                {
                    ...(lumberjackBaseProperties),
                    [BaseGitRestTelemetryProperties.directoryPath]: gitdir,
                });
        };

        return this.internalHandler(params, onRepoNotExists, true);
    }

    public async open(params: IRepoManagerParams): Promise<IRepositoryManager> {
        const onRepoNotExists = (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => {
            Lumberjack.error(
                `Repo does not exist ${gitdir}`,
                {
                    ...(lumberjackBaseProperties),
                    [BaseGitRestTelemetryProperties.directoryPath]: gitdir,
                });
                // services-client/getOrCreateRepository depends on a 400 response code
                throw new NetworkError(400, `Repo does not exist ${gitdir}`);
            };

        return this.internalHandler(params, onRepoNotExists, false);
    }

    private async repoPerDocInternalHandler(
        params: IRepoManagerParams,
        onRepoNotExists: (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => Promise<void> | never,
        shouldUseMutex: boolean): Promise<IRepositoryManager> {
        if (!params.storageRoutingId?.tenantId || !params.storageRoutingId?.documentId) {
            throw new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`);
        }

        const repoPath = helpers.getRepoPath(
            params.storageRoutingId.tenantId,
            params.storageRoutingId.documentId,
            this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined);
        const directoryPath = helpers.getGitDirectory(repoPath, this.storageDirectoryConfig.baseDir);
        const repoName = `${params.storageRoutingId.tenantId}/${params.storageRoutingId.documentId}`;

        return this.internalHandlerCore(
            params,
            repoPath,
            directoryPath,
            repoName,
            onRepoNotExists,
            shouldUseMutex);
    }

    private async repoPerTenantInternalHandler(
        params: IRepoManagerParams,
        onRepoNotExists: (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => Promise<void> | never,
        shouldUseMutex: boolean): Promise<IRepositoryManager> {
        const repoPath = helpers.getRepoPath(
            params.repoName,
            undefined,
            this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined);
        const directoryPath = helpers.getGitDirectory(repoPath, this.storageDirectoryConfig.baseDir);

        return this.internalHandlerCore(
            params,
            repoPath,
            directoryPath,
            params.repoName,
            onRepoNotExists,
            shouldUseMutex);
    }

    private async internalHandlerCore(
        params: IRepoManagerParams,
        repoPath: string,
        directoryPath: string,
        repoName: string,
        onRepoNotExists: (
            fileSystemManager: IFileSystemManager,
            repoPath: string,
            gitdir: string,
            lumberjackBaseProperties: Record<string, any>,
        ) => Promise<void> | never,
        shouldUseMutex: boolean): Promise<IRepositoryManager> {
        const lumberjackBaseProperties = helpers.getLumberjackBasePropertiesFromRepoManagerParams(params);
        const fileSystemManager = this.fileSystemManagerFactory.create(params.fileSystemManagerParams);

        // We define the function below to be able to call it either on its own or within the mutex.
        const action = async () => {
            if (!this.repositoryCache.has(repoPath)) {
                const repoExists = await helpers.exists(fileSystemManager, directoryPath);
                if (!repoExists || !repoExists.isDirectory()) {
                    await onRepoNotExists(
                        fileSystemManager,
                        repoPath,
                        directoryPath,
                        lumberjackBaseProperties);
                } else {
                    const repo = await this.openGitRepo(directoryPath);
                    this.repositoryCache.set(repoPath, repo);
                }
            }

            const repository = this.repositoryCache.get(repoPath);
            return this.createRepoManager(
                fileSystemManager,
                params.repoOwner,
                repoName,
                repository,
                directoryPath,
                this.externalStorageManager,
                lumberjackBaseProperties);
        };

        if (shouldUseMutex) {
            if (!this.mutexes.has(repoName)) {
                this.mutexes.set(repoName, withTimeout(new Mutex(), 10000));
            }
            const mutex = this.mutexes.get(repoName);
            try {
                return mutex.runExclusive(async () => {
                    return action();
                });
            } catch (e: any) {
                if (e === E_TIMEOUT) {
                    throw new NetworkError(500, "Could not complete action due to mutex timeout.");
                }
                throw new NetworkError(500, `Unknown error when trying to run action:  ${e?.message}`);
            }
        } else {
            return action();
        }
    }
}
