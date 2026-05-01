/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PresenceWithNotifications } from "@fluid-internal/presence-definitions";
import type { ContainerExtensionStore } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidContainerAttached } from "@fluidframework/runtime-definitions/internal";
import { ServiceContainerBase } from "@fluidframework/runtime-definitions/internal";

import { ContainerPresenceFactory, extensionId } from "./containerPresence.js";

/**
 * Get {@link PresenceWithNotifications} from a {@link @fluidframework/runtime-definitions#FluidContainerAttached}
 * obtained from any {@link @fluidframework/runtime-definitions#ServiceClient}.
 *
 * @alpha
 */
export function getPresenceFromContainer(
	container: FluidContainerAttached,
): PresenceWithNotifications {
	ServiceContainerBase.narrow(container);
	const runtime = container.getRuntime() as unknown as ContainerExtensionStore;
	return runtime.acquireExtension(extensionId, ContainerPresenceFactory);
}
