/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { SharedObjectCore } from "@fluidframework/shared-object-base";

import { SharedCounterView, SharedMapView, SharedStringView } from "./components";

// TODOs:
// - Default rendering policies for SharedTree? PropertyDDS?
//   - If so, we should consider using existing debug visualizations created for those DDS_s.

/**
 * Renders child data of some shared object.
 *
 * @remarks
 *
 * The child data can be a primitive or a
 * {@link @fluidframework/core-interfaces#IFluidHandle | handle to another shared object}.
 */
export type RenderChild = (childObject: unknown) => React.ReactElement;

/**
 * Signature for data object view renderer callbacks.
 */
export type RenderSharedObject = (
    sharedObject: SharedObjectCore, // TODO: is this the right type?
    renderChild: RenderChild,
) => React.ReactElement;

/**
 * The type of a shared object.
 * Can be acquired via {@link @fluidframework/datastore-definitions#IChannelFactory.Type} field of
 * your shared-object's factory class.
 *
 * TODO: can we do something better here?
 */
export type SharedObjectType = string;

/**
 * Specifies renderers for different {@link @fluidframework/shared-object-base#ISharedObject} types.
 *
 * @remarks
 *
 * - key: The type of Shared object ({@link @fluidframework/datastore-definitions#IChannelFactory.Type}).
 *
 * - value: A renderer that takes a {@link @fluidframework/shared-object-base#SharedObjectCore} of the
 * specified type and renders a `ReactElement` visualizing the data as desired.
 */
export interface SharedObjectRendererOptions {
    /**
     * Individual render policies, keyed by {@link SharedObjectType}.
     */
    [k: SharedObjectType]: RenderSharedObject;
}

/**
 * Default bundled renderers.
 *
 * @remarks
 *
 * Includes defaults for the following DDS types:
 *
 * - {@link @fluidframework/counter#SharedCounter}
 *
 * - {@link @fluidframework/map#SharedMap}
 *
 * - {@link @fluidframework/sequence#SharedString}
 */
export const defaultSharedObjectRenderers: SharedObjectRendererOptions = {
    [SharedCounter.getFactory().type]: (sharedObject) => (
        <SharedCounterView sharedCounter={sharedObject as SharedCounter} />
    ),
    [SharedMap.getFactory().type]: (sharedObject, renderChild) => (
        <SharedMapView sharedMap={sharedObject as SharedMap} renderChild={renderChild} />
    ),
    [SharedString.getFactory().type]: (sharedObject) => (
        <SharedStringView sharedString={sharedObject as SharedString} />
    ),
};

/**
 * Combines the specified set of custom renderer options with the default options bundled with this library.
 *
 * @remarks Custom renderers will take precendence over library defaults.
 */
export function sharedObjectRendererOptionsWithDefaults(
    customOptions: SharedObjectRendererOptions,
): SharedObjectRendererOptions {
    return {
        ...defaultSharedObjectRenderers,
        ...customOptions,
    };
}
