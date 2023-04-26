/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerDevtoolsProps } from "./ContainerDevtools";
import { FluidDevtools, FluidDevtoolsProps } from "./FluidDevtools";
import { IFluidDevtools } from "./IFluidDevtools";

/**
 * Devtools singleton instance.
 * Lifetime is bound to that of the page.
 */
let devtools: IFluidDevtools | undefined;

// Ensure we close Devtools singleton before page close / refresh.
window.addEventListener("beforeunload", () => closeDevtools());

/**
 * Initializes the Devtools.
 *
 * @remarks
 *
 * The instance is tracked as a static singleton.
 * It is automatically disposed on webpage unload, but it can be closed earlier via {@link closeDevtools}.
 *
 * @public
 */
export function initializeDevtools(props?: FluidDevtoolsProps): void {
	if (devtools !== undefined) {
		console.warn("Devtools have already been initialized. Overriding existing devtools.");
		devtools.dispose();
	}
	devtools = new FluidDevtools(props);
}

/**
 * Closes the Devtools, if an instance is active.
 *
 * @public
 */
export function closeDevtools(): void {
	if (devtools === undefined) {
		console.warn("No active Devtools exist to dispose.");
	} else {
		devtools.dispose();
		devtools = undefined;
	}
}

/**
 * TODO
 *
 * @public
 */
export function initializeContainerDevtools(props: ContainerDevtoolsProps): void {
	if (devtools === undefined) {
		throw new Error(
			"Devtools have not been initialized, or have already been disposed. Must initialize Devtools via `initializeDevtools` before registering a Container.",
		);
	}
	devtools.registerContainerDevtools(props);
}

/**
 * TODO
 *
 * @public
 */
export function closeContainerDevtools(containerId: string): void {
	if (devtools === undefined) {
		throw new Error(
			"Devtools have not been initialized, or have already been disposed. Cannot close Container Devtools.",
		);
	}
	devtools.closeContainerDevtools(containerId);
}
