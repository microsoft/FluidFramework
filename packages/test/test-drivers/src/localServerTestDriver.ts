/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { LocalDriverApiType, LocalDriverApi } from "./localDriverApi";

/**
 * @internal
 */
export class LocalServerTestDriver implements ITestDriver {
	private readonly _server = LocalDeltaConnectionServer.create();
	public readonly endpointName = "local";
	public readonly type = "local";
	public get version() {
		return this.api.version;
	}
	public get server(): ILocalDeltaConnectionServer {
		return this._server;
	}

	constructor(
		private readonly api: LocalDriverApiType = LocalDriverApi,
		maxOps = 200,
	) {
		this._server = api.LocalDeltaConnectionServer.create(undefined, {
			deli: {
				summaryNackMessages: {
					enable: true,
					maxOps,
					nackContent: {
						retryAfter: 0,
					},
				},
			},
			scribe: {
				generateServiceSummary: false,
			},
		} as any); // Casting to "any" so we don't have to fill out all properties
	}

	createDocumentServiceFactory(): IDocumentServiceFactory {
		return new this.api.LocalDocumentServiceFactory(this._server);
	}
	createUrlResolver(): IUrlResolver {
		return new this.api.LocalResolver();
	}
	createCreateNewRequest(testId: string): IRequest {
		return this.api.createLocalResolverCreateNewRequest(testId);
	}

	async createContainerUrl(testId: string): Promise<string> {
		return `http://localhost/${testId}`;
	}
}
