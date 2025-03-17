/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { LocalDriverApi, LocalDriverApiType } from "./localDriverApi.js";

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

	/**
	 * LocalServerTestDriver constructor
	 * @param api - driver API
	 * @param maxOpsBeforeSummary - tells how many ops service allows to be sequenced before requiring a summary.
	 * If a test submits more ops, connection will disconnec with nack and error message "Submit a summary before inserting additional operations"
	 */
	constructor(
		private readonly api: LocalDriverApiType = LocalDriverApi,
		maxOpsBeforeSummary = 200,
	) {
		this._server = api.LocalDeltaConnectionServer.create(undefined, {
			deli: {
				summaryNackMessages: {
					enable: true,
					maxOps: maxOpsBeforeSummary,
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
	tenantName?: string | undefined;
	userIndex?: number | undefined;

	public disposed: boolean = false;
	dispose(error?: Error): void {
		if (this.disposed) return;
		this.disposed = true;
		void this.server.close();
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
