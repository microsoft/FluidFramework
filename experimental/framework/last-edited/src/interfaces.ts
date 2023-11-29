/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/protocol-definitions";

/**
 * @public
 */
export const IFluidLastEditedTracker: keyof IProvideFluidLastEditedTracker =
	"IFluidLastEditedTracker";

/**
 * @public
 */
export interface IProvideFluidLastEditedTracker {
	readonly IFluidLastEditedTracker: IFluidLastEditedTracker;
}

/**
 * @public
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
 * @public
 */
export interface ILastEditDetails {
	user: IUser;
	timestamp: number;
}
