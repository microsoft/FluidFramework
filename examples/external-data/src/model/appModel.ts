/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";

import type { IAppModel, IAppModelEvents, IBaseDocument } from "../model-interface";

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
	 * {@inheritDoc IAppModel.sendCustomDebugSignal}
	 */
	public readonly sendCustomDebugSignal = (): void => {
		this.runtime.submitSignal("debugSignal", {
			type: "ExternalDataChange",
			taskListId: "task-list-1",
		});
	};

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
	public readonly getContainerResolvedUrl = (): IFluidResolvedUrl | undefined => {
		return this.container?.resolvedUrl as IFluidResolvedUrl;
	};
}
