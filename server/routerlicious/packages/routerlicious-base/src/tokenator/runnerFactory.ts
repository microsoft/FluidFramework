/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import { Provider } from "nconf";
import {
	IAccessTokenGenerator,
	IRunnerFactory,
	IRunner,
} from "@fluidframework/server-services-core";
import type {
	IReadinessCheck,
	IResources,
	IResourcesFactory,
	IWebServerFactory,
} from "@fluidframework/server-services-core";
import type { ITokenatorResourcesCustomizations } from "./customizations";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { TokenatorRunner } from "./runner";
import * as utils from "@fluidframework/server-services-utils";
import type { Router } from "express";
import { AccessTokenGenerator } from "./accessTokenGenerator";

export class TokenatorResources implements IResources {
	public webServerFactory: IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly port: any,
		public readonly loggerFormat: string,
		public readonly accessTokenGenerator: IAccessTokenGenerator,
		public readonly startupCheck: IReadinessCheck,
		public readonly routerFactory?: (accessTokenGenerator: IAccessTokenGenerator) => Router,
		public readonly readinessCheck?: IReadinessCheck,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		const nodeClusterConfig: Partial<services.INodeClusterConfig> | undefined = config.get(
			"tokenator:nodeClusterConfig",
		);
		const useNodeCluster = config.get("tokenator:useNodeCluster");
		this.webServerFactory = useNodeCluster
			? new services.NodeClusterWebServerFactory(httpServerConfig, nodeClusterConfig)
			: new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {}
}

export class TokenatorResourceFactory implements IResourcesFactory<TokenatorResources> {
	public async create(
		config: Provider,
		customizations?: ITokenatorResourcesCustomizations,
	): Promise<TokenatorResources> {
		const accessTokenGenerator = customizations?.accessTokenGenerator
			? customizations.accessTokenGenerator
			: new AccessTokenGenerator();
		const port = utils.normalizePort(process.env.PORT || "3000");
		const loggerFormat = config.get("logger:morganFormat");

		const startupCheck = new StartupCheck();
		const readinessCheck = customizations?.readinessCheck ?? customizations.readinessCheck;

		return new TokenatorResources(
			config,
			port,
			loggerFormat,
			accessTokenGenerator,
			startupCheck,
			undefined,
			readinessCheck,
		);
	}
}

export class TokenatorRunnerFactory implements IRunnerFactory<TokenatorResources> {
	public async create(resources: TokenatorResources): Promise<IRunner> {
		return new TokenatorRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.loggerFormat,
			resources.accessTokenGenerator,
			resources.startupCheck,
			resources.routerFactory,
			resources.readinessCheck,
		);
	}
}
