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
	ClientDebugView,
	clientDebugViewClassName,
	ClientDebugViewProps,
} from "./components";

export { AudienceMember } from "./Audience";
export { HasClientDebugger, HasContainerId } from "./CommonProps";
export { FluidClientDebugger, FluidClientDebuggerProps } from "./Debugger";
export { renderClientDebuggerView } from "./RenderClientDebugger";
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
