/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IContainer } from "@fluidframework/container-definitions/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { IResolvedUrl } from "@fluidframework/driver-definitions/legacy";

import type { IAppModel, IAppModelEvents, IBaseDocument } from "../model-interface/index.js";

/**
 * In this demo, the AppModel just needs to hold the taskList.  In a real scenario, this may have further
 * responsibilities and functionality.
 */
export class AppModel extends TypedEventEmitter<IAppModelEvents> implements IAppModel {
	public constructor(
		public readonly baseDocument: IBaseDocument,
		private readonly container: IContainer,
		private readonly runtime: IContainerRuntime,
	) {
		super();
	}

	/**
	 * {@inheritDoc IAppModel.getClientId}
	 */
	public getClientID(): string | undefined {
		return this.runtime.clientId;
	}

	/**
	 * {@inheritDoc IAppModel.handleClaimLeadership}
	 */
	public handleClaimLeadership(): void {
		const clientID = this.runtime.clientId;
		if (clientID === undefined) {
			throw new Error("clientID is undefined");
		}
		this.baseDocument.setLeader(clientID);
		console.log(`Setting leader to ${clientID}`);
	}
	/**
	 * {@inheritDoc IAppModel.getContainerResolvedUrl}
	 */
	public readonly getContainerResolvedUrl = (): IResolvedUrl | undefined => {
		return this.container?.resolvedUrl;
	};
}
