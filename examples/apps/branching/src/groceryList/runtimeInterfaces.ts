/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * Interfaces that probably should be in some runtime package.  Describe runtime objects with scoped
 * capabilities.
 */

export interface IDisposableEvents extends IEvent {
	// Note that IFluidDataStoreRuntime calls the event "dispose" rather than "disposed"
	(event: "dispose", listener: () => void);
}

// TODO: Don't extend IEventProvider.
export interface IDisposableParent extends IEventProvider<IDisposableEvents> {
	readonly disposed: boolean;
}
