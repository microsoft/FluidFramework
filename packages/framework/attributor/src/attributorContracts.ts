/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type AttributionInfo,
	type AttributionKey,
} from "@fluidframework/runtime-definitions/internal";

// Summary tree keys
export const opBlobName = "opAttributor";

/**
 * @internal
 */
export const enableOnNewFileKey = "Fluid.Attribution.EnableOnNewFile";

/**
 * @internal
 */
export const IRuntimeAttributor: keyof IProvideRuntimeAttributor = "IRuntimeAttributor";

/**
 * @internal
 */
export interface IProvideRuntimeAttributor {
	readonly IRuntimeAttributor: IRuntimeAttributor;
}

/**
 * @internal
 */
export const attributorDataStoreAlias = "attributor-cf9b6fe4-4c50-4a5d-9045-eb73b886f740";

/**
 * Provides access to attribution information stored on the container runtime.
 *
 * @remarks Attributors are only populated after the container runtime into which they are being injected has initialized.
 *
 * @sealed
 * @internal
 */
export interface IRuntimeAttributor extends IProvideRuntimeAttributor {
	/**
	 * @throws - If no AttributionInfo exists for this key.
	 */
	get(key: AttributionKey): AttributionInfo;

	/**
	 * @returns Whether any AttributionInfo exists for the provided key.
	 */
	has(key: AttributionKey): boolean;

	/**
	 * @returns Whether the runtime is currently tracking attribution information for the loaded container.
	 * If enabled, the runtime attributor can be asked for the attribution info for different keys.
	 * See {@link mixinAttributor} for more details on when this happens.
	 */
	readonly isEnabled: boolean;
}
