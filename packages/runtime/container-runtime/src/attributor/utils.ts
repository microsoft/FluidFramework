/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type AttributionInfo,
	type AttributionKey,
} from "@fluidframework/runtime-definitions/internal";

// Summary tree keys
export const attributorTreeName = ".attributor";
export const opBlobName = "op";

/**
 * @alpha
 */
export const enableOnNewFileKey = "Fluid.Attribution.EnableOnNewFile";

/**
 * @alpha
 */
export const IRuntimeAttributor: keyof IProvideRuntimeAttributor = "IRuntimeAttributor";

/**
 * @alpha
 */
export interface IProvideRuntimeAttributor {
	readonly IRuntimeAttributor: IRuntimeAttributor;
}

/**
 * Provides access to attribution information stored on the container runtime.
 *
 * @remarks Attributors are only populated after the container runtime into which they are being injected has initialized.
 *
 * @sealed
 * @alpha
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
	 */
	readonly isEnabled: boolean;
}
