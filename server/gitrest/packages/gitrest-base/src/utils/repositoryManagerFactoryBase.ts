/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { executeApiWithMetric } from "@fluidframework/server-services-utils";
import { E_TIMEOUT, Mutex, MutexInterface, withTimeout } from "async-mutex";
import { IExternalStorageManager } from "../externalStorageManager";
import {
	Constants,
	IFileSystemManager,
	IFileSystemManagerFactories,
	IFileSystemManagerParams,
	IRepoManagerParams,
	IRepositoryManager,
	IRepositoryManagerFactory,
	IStorageDirectoryConfig,
} from "./definitions";
import {
	BaseGitRestTelemetryProperties,
	GitRestLumberEventName,
	GitRestRepositoryApiCategory,
} from "./gitrestTelemetryDefinitions";
import * as helpers from "./helpers";

type RepoOperationType = "create" | "open";

export abstract class RepositoryManagerFactoryBase<TRepo> implements IRepositoryManagerFactory {
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
		repoOperationType: RepoOperationType,
	) => Promise<IRepositoryManager>;
	// Cache repositories to allow for reuse
	protected readonly repositoryCache = new Map<string, TRepo>();
	protected abstract initGitRepo(
		fs: IFileSystemManager,
		gitdir: string,
		fsParams: IFileSystemManagerParams | undefined,
	): Promise<TRepo>;
	protected abstract openGitRepo(gitdir: string): Promise<TRepo>;
	protected abstract createRepoManager(
		fileSystemManager: IFileSystemManager,
		repoOwner: string,
		repoName: string,
		repo: TRepo | undefined,
		gitdir: string,
		externalStorageManager: IExternalStorageManager,
		lumberjackBaseProperties: Record<string, any>,
		enableRepositoryManagerMetrics: boolean,
		apiMetricsSamplingPeriod?: number,
		isEphemeralContainer?: boolean,
		maxBlobSizeBytes?: number,
	): IRepositoryManager;

	constructor(
		private readonly storageDirectoryConfig: IStorageDirectoryConfig,
		private readonly fileSystemManagerFactories: IFileSystemManagerFactories,
		private readonly externalStorageManager: IExternalStorageManager,
		repoPerDocEnabled: boolean,
		private readonly enableRepositoryManagerMetrics: boolean = false,
		private readonly enforceSynchronous: boolean = true,
		private readonly apiMetricsSamplingPeriod?: number,
		private readonly maxBlobSizeBytes?: number,
	) {
		this.internalHandler = repoPerDocEnabled
			? this.repoPerDocInternalHandler.bind(this)
			: this.repoPerTenantInternalHandler.bind(this);
	}

	public async create(params: IRepoManagerParams): Promise<IRepositoryManager> {
		const onRepoNotExists = async (
			fileSystemManager: IFileSystemManager,
			repoPath: string,
			gitdir: string,
			lumberjackBaseProperties: Record<string, any>,
		) => {
			// Create and then cache the repository
			const repository = await this.initGitRepo(
				fileSystemManager,
				gitdir,
				params.fileSystemManagerParams,
			);
			this.repositoryCache.set(repoPath, repository);
			Lumberjack.info("Created a new repo", {
				...lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.directoryPath]: gitdir,
			});
		};

		return executeApiWithMetric(
			async () => this.internalHandler(params, onRepoNotExists, "create"),
			GitRestLumberEventName.RepositoryManagerFactory,
			GitRestRepositoryApiCategory.CreateRepo,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			helpers.getLumberjackBasePropertiesFromRepoManagerParams(params),
		);
	}

	public async open(params: IRepoManagerParams): Promise<IRepositoryManager> {
		const onRepoNotExists = (
			fileSystemManager: IFileSystemManager,
			repoPath: string,
			gitdir: string,
			lumberjackBaseProperties: Record<string, any>,
		) => {
			Lumberjack.error(`Repo does not exist ${gitdir}`, {
				...lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.directoryPath]: gitdir,
			});
			// services-client/getOrCreateRepository depends on a 400 response code
			throw new NetworkError(400, `Repo does not exist ${gitdir}`);
		};

		return executeApiWithMetric(
			async () => this.internalHandler(params, onRepoNotExists, "open"),
			GitRestLumberEventName.RepositoryManagerFactory,
			GitRestRepositoryApiCategory.OpenRepo,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			helpers.getLumberjackBasePropertiesFromRepoManagerParams(params),
		);
	}

	private async repoPerDocInternalHandler(
		params: IRepoManagerParams,
		onRepoNotExists: (
			fileSystemManager: IFileSystemManager,
			repoPath: string,
			gitdir: string,
			lumberjackBaseProperties: Record<string, any>,
		) => Promise<void> | never,
		repoOperationType: RepoOperationType,
	): Promise<IRepositoryManager> {
		if (!params.storageRoutingId?.tenantId || !params.storageRoutingId?.documentId) {
			throw new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`);
		}
		const repoPath = helpers.getRepoPath(
			params.storageRoutingId.tenantId,
			params.storageRoutingId.documentId,
			this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined,
		);
		const directoryPath = helpers.getGitDirectory(
			repoPath,
			this.storageDirectoryConfig.baseDir,
			this.storageDirectoryConfig.suffixPath,
		);
		const repoName = `${params.storageRoutingId.tenantId}/${params.storageRoutingId.documentId}`;

		return this.internalHandlerCore(
			params,
			repoPath,
			directoryPath,
			repoName,
			onRepoNotExists,
			repoOperationType,
		);
	}

	private async repoPerTenantInternalHandler(
		params: IRepoManagerParams,
		onRepoNotExists: (
			fileSystemManager: IFileSystemManager,
			repoPath: string,
			gitdir: string,
			lumberjackBaseProperties: Record<string, any>,
		) => Promise<void> | never,
		repoOperationType: RepoOperationType,
	): Promise<IRepositoryManager> {
		const repoPath = helpers.getRepoPath(
			params.repoName,
			undefined,
			this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined,
		);
		const directoryPath = helpers.getGitDirectory(
			repoPath,
			this.storageDirectoryConfig.baseDir,
			this.storageDirectoryConfig.suffixPath,
		);

		return this.internalHandlerCore(
			params,
			repoPath,
			directoryPath,
			params.repoName,
			onRepoNotExists,
			repoOperationType,
		);
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
		repoOperationType: RepoOperationType,
	): Promise<IRepositoryManager> {
		const lumberjackBaseProperties =
			helpers.getLumberjackBasePropertiesFromRepoManagerParams(params);

		const fileSystemManagerFactory =
			!params.isEphemeralContainer ||
			!this.fileSystemManagerFactories.ephemeralFileSystemManagerFactory
				? this.fileSystemManagerFactories.defaultFileSystemManagerFactory
				: this.fileSystemManagerFactories.ephemeralFileSystemManagerFactory;

		const fileSystemManager = fileSystemManagerFactory.create({
			...params.fileSystemManagerParams,
			rootDir: directoryPath,
		});

		// We define the function below to be able to call it either on its own or within the mutex.
		const action = async () => {
			if (params.optimizeForInitialSummary && repoOperationType === "create") {
				// Skip checking if repo exists when optimizing for an initial summary.
				await onRepoNotExists(
					fileSystemManager,
					repoPath,
					directoryPath,
					lumberjackBaseProperties,
				);
			} else {
				// We only lock on the mutex for "create repo" operations, since we want repo creation to happen
				// atomically. That means that "open repo" operations can happen in parallel, without the need
				// for acquiring the lock/mutex. However, imagine the following scenario: one "create repo" operation
				// acquired the lock for repo A, and then a concurrent "open repo" request comes for repo A. The
				// "open repo" request will not try to acquire the mutex. However, it still needs to wait just in
				// case there is an ongoing "create repo" operation, in order for the "open repo" to succeed.
				// The conditional below makes sure we only proceed with the "open repo" operation if there
				// is no ongoing "create repo".
				const mutex = this.mutexes.get(repoName);
				if (
					this.enforceSynchronous &&
					repoOperationType === "open" &&
					mutex !== undefined &&
					mutex.isLocked()
				) {
					await mutex.waitForUnlock();
				}
				if (!this.repositoryCache.has(repoPath)) {
					const repoExists = await helpers.exists(fileSystemManager, directoryPath);
					if (!repoExists || !repoExists.isDirectory()) {
						await onRepoNotExists(
							fileSystemManager,
							repoPath,
							directoryPath,
							lumberjackBaseProperties,
						);
					} else {
						const repo = await this.openGitRepo(directoryPath);
						this.repositoryCache.set(repoPath, repo);
					}
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
				lumberjackBaseProperties,
				this.enableRepositoryManagerMetrics,
				this.apiMetricsSamplingPeriod,
				params.isEphemeralContainer,
				this.maxBlobSizeBytes,
			);
		};

		// RepoManagerFactories support 2 types of operations: "create repo" and "open repo". "Open repo"
		// operations can happen in parallel. But we don't want "create repo" operations to happen concurrently.
		// In fact, we only want it to happen once. However, under certain situations ("shredded" summaries combined
		// with repo-per-doc model), it is possible that the RepoManagerFactory receive more than 1 "create repo"
		// call. And even though Node.js is single-threaded, due to the async nature of creating a repo and writing
		// to the filesystem, context switching can cause those "create repo" operations to actually happen
		// asynchronously. Therefore, we use a mutex per repository to control concurrent "create repo" requests
		// and make sure only one of them happens atomically.
		if (this.enforceSynchronous && repoOperationType === "create") {
			const mutex = this.mutexes.get(repoName) ?? withTimeout(new Mutex(), 100000);
			if (!this.mutexes.has(repoName)) {
				this.mutexes.set(repoName, mutex);
			}
			try {
				// eslint-disable-next-line @typescript-eslint/return-await
				return mutex.runExclusive(async () => {
					return action();
				});
			} catch (e: any) {
				if (e === E_TIMEOUT) {
					throw new NetworkError(500, "Could not complete action due to mutex timeout.");
				}
				throw new NetworkError(
					500,
					`Unknown error when trying to run action:  ${e?.message}`,
				);
			}
		} else {
			return action();
		}
	}
}
