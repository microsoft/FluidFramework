/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidClientDebugger } from "@fluid-tools/client-debugger";

/**
 * This module contains interfaces for common props used by React components in this library.
 * The primary goal is to offer a central place for documenting common input properties.
 */

/**
 * Base interface for component props that observe data and updates coming from the Client debugger.
 *
 * @internal
 */
export interface HasClientDebugger {
	/**
	 * Debugger object that is collecting session data to be displayed.
	 */
	clientDebugger: IFluidClientDebugger;
}

/**
 * Base interface for component props that include the ID of a Fluid Container.
 *
 * @internal
 */
export interface HasContainerId {
	/**
	 * The unique ID of the Fliud Container with which the debugger is associated.
	 */
	containerId: string;
}

/**
 * Base interface for component props that include a session client ID.
 */
export interface HasClientId {
	/**
	 * The unique ID of the session client.
	 */
	clientId: string;
}
