/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains APIs for debugging Fluid Client sessions.
 *
 * Debugger instances are created per {@link @fluidframework/container-definitions#IContainer} instance and are bound
 * to the `globalThis` context to be accessible to related tools.
 *
 * - See the package README for more details on related tools that are enabled via these debugger instances.
 *
 * @remarks
 *
 * The general usage pattern for this library is to first initialize a debugger for a given Fluid Client
 * ({@link @fluidframework/container-definitions#IContainer} and {@link @fluidframework/container-definitions#IAudience})
 * by calling {@link initializeFluidClientDebugger} during application setup / any time after your container has been
 * attached.
 *
 * Then, during application teardown, call {@link closeFluidClientDebugger} to clean up the debugger and its resources.
 *
 * @example Initialization
 *
 * ```typescript
 * initializeFluidClientDebugger({
 *  containerId,
 *  container,
 *  containerData: {
 *      rootMap: sharedMap
 *  },
 * });
 * ```
 *
 * @example Disposal
 *
 * ```typescript
 * closeFluidClientDebugger(containerId);
 * ```
 *
 * @packageDocumentation
 */

export { MemberChangeKind } from "./Audience";

export { IFluidClientDebugger, IFluidClientDebuggerEvents } from "./IFluidClientDebugger";

export {
	AudienceChangeLogEntry,
	ConnectionStateChangeLogEntry,
	LogEntry,
	StateChangeLogEntry,
} from "./Logs";

export {
	clearDebuggerRegistry,
	closeFluidClientDebugger,
	FluidClientDebuggerProps,
	getFluidClientDebugger,
	getFluidClientDebuggers,
	initializeFluidClientDebugger,
} from "./Registry";
