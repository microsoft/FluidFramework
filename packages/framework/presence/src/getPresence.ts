/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Presence } from "@fluid-internal/presence-definitions";
import {
	ContainerPresenceFactory,
	extensionId,
} from "@fluid-internal/presence-runtime/extension";
import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidContainer } from "@fluidframework/fluid-static";
import { getPresenceAlpha } from "@fluidframework/fluid-static/internal";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

export { getPresenceFromContainer } from "@fluid-internal/presence-runtime/extension";

/**
 * Acquire a {@link Presence} from a Fluid Container
 * @param fluidContainer - Fluid Container to acquire the map from
 * @returns the {@link Presence}
 *
 * @beta
 *
 * @deprecated Import from `fluid-framework` instead. This export will be removed in the 2.110.0 release.
 * See {@link https://github.com/microsoft/FluidFramework/issues/26397}
 */
export const getPresence: (fluidContainer: IFluidContainer) => Presence = getPresenceAlpha;

function assertContextHasExtensionProvider(
	context: IFluidDataStoreContext,
): asserts context is FluidDataStoreContextInternal {
	assert(
		"getExtension" in context,
		0xc9c /* Data store context does not implement ContainerExtensionProvider */,
	);
}

/**
 * Get {@link Presence} from a Fluid Data Store Context
 *
 * @legacy @alpha
 */
export function getPresenceFromDataStoreContext(context: IFluidDataStoreContext): Presence {
	assertContextHasExtensionProvider(context);
	return context.getExtension(extensionId, ContainerPresenceFactory);
}
