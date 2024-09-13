/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/driver-definitions";

/**
 * @internal
 */
export const IFluidLastEditedTracker: keyof IProvideFluidLastEditedTracker =
	"IFluidLastEditedTracker";

/**
 * @internal
 */
export interface IProvideFluidLastEditedTracker {
	readonly IFluidLastEditedTracker: IFluidLastEditedTracker;
}

/**
 * @internal
 */
export interface IFluidLastEditedTracker extends IProvideFluidLastEditedTracker {
	/**
	 * Returns the details of the last edit to the container.
	 */
	getLastEditDetails(): ILastEditDetails | undefined;

	/**
	 * Updates the details of last edit to the container.
	 */
	updateLastEditDetails(lastEditDetails: ILastEditDetails): void;
}

/**
 * @internal
 */
export interface ILastEditDetails {
	user: IUser;
	timestamp: number;
}
