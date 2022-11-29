/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains APIs for debugging Fluid Client sessions.
 *
 * TODO: more details
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
