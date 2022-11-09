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

export {
    IFluidClientDebugger,
    IFluidClientDebuggerEvents,
    FluidClientDebuggerProps,
} from "./IFluidClientDebugger";

export {
    AudienceChangeLogEntry,
    ConnectionStateChangeLogEntry,
    LogEntry,
    StateChangeLogEntry,
} from "./Logs";

export {
    closeFluidClientDebugger,
    getFluidClientDebugger,
    initializeFluidClientDebugger,
} from "./Registry";
