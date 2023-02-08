/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains an extensible debug visualizer / editor for the Fluid client.
 *
 * @remarks
 *
 * This package has 2 primary entry-points:
 *
 * - {@link renderClientDebuggerView}: A general-purpose rendering utility for displaying debug information.
 *
 * - {@link FluidClientDebugger}: A {@link https://reactjs.org/docs/react-component.html | React Component} for displaying debug information,
 * which can be added to your Fluid-backed React app.
 *
 * @privateRemarks TODO: Add examples once the API surface has solidified.
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
export {
	FluidClientDebuggers,
	FluidClientDebuggersProps as FluidClientDebuggerProps,
} from "./Debugger";
export { renderClientDebuggerView } from "./RenderClientDebugger";
export {
	defaultRenderOptions,
	defaultSharedObjectRenderers,
	RenderChild,
	RenderOptions,
	RenderSharedObject,
	SharedObjectRenderOptions,
	SharedObjectType,
} from "./RendererOptions";
