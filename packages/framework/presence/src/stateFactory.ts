/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { BroadcastControlSettings } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import { latestMapFactory, type LatestMapValueManager } from "./latestMapValueManager.js";
import { Latest, type LatestValueManager } from "./latestValueManager.js";

/**
 * Factory for creating presence state objects.
 *
 * @alpha
 */
export const StateFactory = {
	latest<T extends object, Key extends string = string>(
		initialValue: JsonSerializable<T> & JsonDeserialized<T> & object,
		controls?: BroadcastControlSettings,
	): InternalTypes.ManagerFactory<
		Key,
		InternalTypes.ValueRequiredState<T>,
		LatestValueManager<T>
	> {
		return Latest<T, Key>(initialValue, controls);
	},

	latestMap<
		T extends object,
		Keys extends string | number = string | number,
		RegistrationKey extends string = string,
	>(
		initialValues?: {
			[K in Keys]: JsonSerializable<T> & JsonDeserialized<T>;
		},
		controls?: BroadcastControlSettings,
	): InternalTypes.ManagerFactory<
		RegistrationKey,
		InternalTypes.MapValueState<T, Keys>,
		LatestMapValueManager<T, Keys>
	> {
		return latestMapFactory<T, Keys, RegistrationKey>(initialValues, controls);
	},
};
