/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains an externsible debug visualizer / editor for the Fluid client.
 *
 * @remarks
 *
 * The primary entry-point to this package is {@link ClientDebugView}.
 *
 * Rendering options can be configured using {@link ClientDebugViewProps.renderOptions}.
 *
 * @packageDocumentation
 */

export {
    AudienceMemberViewProps,
    OpViewProps,
    ClientDebugView,
    ClientDebugViewProps,
} from "./components";

export {
    getRenderOptionsWithDefaults,
    getSharedObjectRendererOptionsWithDefaults,
    defaultRenderOptions,
    defaultSharedObjectRenderers,
    RenderChild,
    RenderOptions,
    RenderSharedObject,
    SharedObjectRenderOptions,
    SharedObjectType,
} from "./RendererOptions";
