/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@fluidframework/shared-object-base";
import { EditType } from "../CommonInterfaces";

// Ideas:
// - Hold onto previous summary and only transmit diff?

// TODOs:
// - Dependency tracking
//   - When a particular DDS is no longer reachable via the input data, we need to remove it from the map and stop
//     emitting updates.

/**
 * The type of a shared object.
 *
 * @remarks
 *
 * This can be acquired via {@link @fluidframework/datastore-definitions#IChannelFactory.Type} field of
 * your shared object's factory class.
 */
export type SharedObjectType = string;

/**
 * Generates a visual description of the provided {@link @fluidframework/shared-object-base#ISharedObject}'s
 * current state.
 *
 * @param sharedObject - The object whose data will be rendered.
 * @param visualizeChildData - Callback to render child content of the shared object.
 *
 * @returns A visual tree representation of the provided `sharedObject`.
 *
 * @public
 */
export type EditSharedObject = (
	sharedObject: ISharedObject,
	data: string,
	type: EditType,
) => Promise<void>;
