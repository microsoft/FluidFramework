/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as core from "@fluidframework/server-services-core";
import * as services from "@fluidframework/server-services-shared";
import {
	normalizePort,
	IRedisClientConnectionManager,
	RedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import { ExternalStorageManager } from "./externalStorageManager";
import { GitrestRunner } from "./runner";
import {
	IFileSystemManagerFactories,
	IRepositoryManagerFactory,
	IsomorphicGitManagerFactory,
	IStorageDirectoryConfig,
	NodeFsManagerFactory,
	RedisFsManagerFactory,
} from "./utils";
import { IGitrestResourcesCustomizations } from "./customizations";

export class GitrestResources implements core.IResources {
	public webServerFactory: core.IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly port: string | number,
		public readonly fileSystemManagerFactories: IFileSystemManagerFactories,
		public readonly repositoryManagerFactory: IRepositoryManagerFactory,
		public readonly asyncLocalStorage?: AsyncLocalStorage<string>,
		public readonly enableOptimizedInitialSummary?: boolean,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		this.webServerFactory = new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {
		return;
	}
}

export class GitrestResourcesFactory implements core.IResourcesFactory<GitrestResources> {
	public async create(
		config: Provider,
		customizations?: IGitrestResourcesCustomizations,
	): Promise<GitrestResources> {
		const port = normalizePort(process.env.PORT || "3000");
		const asyncLocalStorage = config.get("asyncLocalStorageInstance")?.[0];

		const fileSystemManagerFactories = this.getFileSystemManagerFactories(
			config,
			customizations,
		);
		const repositoryManagerFactory = this.getRepositoryManagerFactory(
			config,
			fileSystemManagerFactories,
		);

		return new GitrestResources(
			config,
			port,
			fileSystemManagerFactories,
			repositoryManagerFactory,
			asyncLocalStorage,
		);
	}

	private getFileSystemManagerFactories(
		config: Provider,
		customizations?: IGitrestResourcesCustomizations,
	): IFileSystemManagerFactories {
		const defaultFileSystemName: string = config.get("git:filesystem:name") ?? "nodeFs";
		const defaultFileSystemMaxFileSizeBytes: number | undefined =
			config.get("git:filesystem:maxFileSizeBytes") ?? 0;

		const ephemeralFileSystemName: string =
			config.get("git:ephemeralfilesystem:name") ?? "redisFs";
		const ephemeralFileSystemMaxFileSizeBytes: number | undefined =
			config.get("git:ephemeralfilesystem:maxFileSizeBytes") ?? 0;

		// Creating two customizations for redisClientConnectionManager for now.
		// This may be changed to a single customization in the future.
		const defaultFileSystemManagerFactory = this.getFileSystemManagerFactoryByName(
			defaultFileSystemName,
			config,
			customizations?.redisClientConnectionManagerForDefaultFileSystem,
			defaultFileSystemMaxFileSizeBytes,
		);
		const ephemeralFileSystemManagerFactory = this.getFileSystemManagerFactoryByName(
			ephemeralFileSystemName,
			config,
			customizations?.redisClientConnectionManagerForEphemeralFileSystem,
			ephemeralFileSystemMaxFileSizeBytes,
		);

		return {
			defaultFileSystemManagerFactory,
			ephemeralFileSystemManagerFactory,
		};
	}

	private getFileSystemManagerFactoryByName(
		fileSystemName: string,
		config: Provider,
		redisClientConnectionManagerCustomization?: IRedisClientConnectionManager,
		maxFileSizeBytes?: number,
	) {
		if (!fileSystemName || fileSystemName === "nodeFs") {
			return new NodeFsManagerFactory(maxFileSizeBytes);
		} else if (fileSystemName === "redisFs") {
			const redisConfig = config.get("redis");
			const redisClientConnectionManager =
				redisClientConnectionManagerCustomization ??
				new RedisClientConnectionManager(
					undefined,
					redisConfig,
					redisConfig.enableClustering,
					redisConfig.slotsRefreshTimeout,
				);
			return new RedisFsManagerFactory(
				config,
				redisClientConnectionManager,
				maxFileSizeBytes,
			);
		}
		throw new Error("Invalid file system name.");
	}

	private getRepositoryManagerFactory(
		config: Provider,
		fileSystemManagerFactories: IFileSystemManagerFactories,
	) {
		const externalStorageManager = new ExternalStorageManager(config);
		const storageDirectoryConfig: IStorageDirectoryConfig = config.get(
			"storageDir",
		) as IStorageDirectoryConfig;
		const gitLibrary: string | undefined = config.get("git:lib:name") ?? "isomporphic-git";
		const repoPerDocEnabled: boolean = config.get("git:repoPerDocEnabled") ?? false;
		const enableRepositoryManagerMetrics: boolean =
			config.get("git:enableRepositoryManagerMetrics") ?? false;
		const apiMetricsSamplingPeriod: number | undefined = config.get(
			"git:apiMetricsSamplingPeriod",
		);
		const enableSlimGitInit: boolean = config.get("git:enableSlimGitInit") ?? false;

		if (gitLibrary === "isomorphic-git") {
			return new IsomorphicGitManagerFactory(
				storageDirectoryConfig,
				fileSystemManagerFactories,
				externalStorageManager,
				repoPerDocEnabled,
				enableRepositoryManagerMetrics,
				enableSlimGitInit,
				apiMetricsSamplingPeriod,
			);
		}
		throw new Error("Invalid git library name.");
	}
}

export class GitrestRunnerFactory implements core.IRunnerFactory<GitrestResources> {
	public async create(resources: GitrestResources): Promise<core.IRunner> {
		return new GitrestRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.fileSystemManagerFactories,
			resources.repositoryManagerFactory,
			resources.asyncLocalStorage,
		);
	}
}
