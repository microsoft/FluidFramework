/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";

import type { IAppModel, IAppModelEvents, ITaskListCollection } from "../model-interface";

/**
 * In this demo, the AppModel just needs to hold the taskList.  In a real scenario, this may have further
 * responsibilities and functionality.
 */
export class AppModel extends TypedEventEmitter<IAppModelEvents> implements IAppModel {
	public constructor(
		public readonly taskListCollection: ITaskListCollection,
		private readonly container: IContainer,
		private readonly runtime: IContainerRuntime,
	) {
		super();
	}

	/**
	 * {@inheritDoc IAppModel.sendCustomDebugSignal}
	 */
	public readonly sendCustomDebugSignal = (): void => {
		this.runtime.submitSignal("debugSignal", { type: "ExternalDataChange" });
	};

	/**
	 * {@inheritDoc IAppModel.registerWithCustomerService}
	 */
	public readonly registerWithCustomerService = (externalTaskListId: string): void => {
		const taskList = this.taskListCollection
			.getTaskList(externalTaskListId)
			.catch(console.error);
		if (taskList === undefined) {
			throw new Error(
				`The task list with id ${externalTaskListId} does not exist in this collection.`,
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		taskList
			.registerWithCustomerService(
				externalTaskListId,
				this.container?.resolvedUrl as IFluidResolvedUrl,
			)
			.catch(console.error);
	};
}
