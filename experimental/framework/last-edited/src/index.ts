/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	IFluidLastEditedTracker,
	type ILastEditDetails,
	type IProvideFluidLastEditedTracker,
} from "./interfaces.js";
export { LastEditedTracker } from "./lastEditedTracker.js";
export { LastEditedTrackerDataObject } from "./lastEditedTrackerDataObject.js";
export { setupLastEditedTrackerForContainer } from "./setup.js";
