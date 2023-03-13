/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { FluidClientDebugger } from "./FluidClientDebugger";
import { debuggerMessageSource, handleIncomingWindowMessage, postMessageToWindow, } from "./messaging";
// TODOs:
// - Clear registry on `window.beforeunload`, to ensure we do not hold onto stale resources.
/**
 * Message logging options used by the registry.
 */
const registryMessageLoggingOptions = {
    context: "DEBUGGER REGISTRY",
};
/**
 * Contract for maintaining a global client debugger registry to store all registered client debugger.
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for:**
 *
 * - {@link GetContainerListMessage}: When received, the registry will post {@link RegistryChangeMessage}.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link RegistryChangeMessage}: The registry will post this whenever the list of registered
 * debuggers changes, or when requested (via {@link GetContainerListMessage}).
 *
 * TODO: Document others as they are added.
 *
 * @internal
 */
export class DebuggerRegistry extends TypedEventEmitter {
    // #endregion
    constructor() {
        var _a;
        super();
        this.registeredDebuggers = new Map();
        // #region Event handlers
        /**
         * Handlers for inbound messages related to the registry.
         */
        this.inboundMessageHandlers = {
            ["GET_CONTAINER_LIST"]: () => {
                this.postRegistryChange();
                return true;
            },
        };
        /**
         * Event handler for messages coming from the window (globalThis).
         */
        this.windowMessageHandler = (event) => {
            handleIncomingWindowMessage(event, this.inboundMessageHandlers, registryMessageLoggingOptions);
        };
        /**
         * Posts a {@link RegistryChangeMessage} to the window (globalThis).
         */
        this.postRegistryChange = () => {
            postMessageToWindow({
                source: debuggerMessageSource,
                type: "REGISTRY_CHANGE",
                data: {
                    containers: [...this.registeredDebuggers.values()].map((clientDebugger) => ({
                        id: clientDebugger.containerId,
                        nickname: clientDebugger.containerNickname,
                    })),
                },
            }, registryMessageLoggingOptions);
        };
        // Register listener for inbound messages from the window (globalThis)
        (_a = globalThis.addEventListener) === null || _a === void 0 ? void 0 : _a.call(globalThis, "message", this.windowMessageHandler);
        // Initiate message posting of registry updates.
        // TODO: Only do this after some external request?
        this.on("debuggerRegistered", this.postRegistryChange);
        this.on("debuggerClosed", this.postRegistryChange);
    }
    /**
     * Initializes a {@link IFluidClientDebugger} from the provided properties and binds it to the global context.
     */
    initializeDebugger(props) {
        const { containerId } = props;
        const existingDebugger = this.registeredDebuggers.get(containerId);
        if (existingDebugger !== undefined) {
            console.warn(`Active debugger registry already contains an entry for container ID "${containerId}". Override existing entry.`);
            existingDebugger.dispose();
        }
        const clientDebugger = new FluidClientDebugger(props);
        console.log(`Add new debugger${clientDebugger.containerId}`);
        this.registeredDebuggers.set(containerId, clientDebugger);
        this.emit("debuggerRegistered", containerId, clientDebugger);
    }
    /**
     * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
     * provided Container ID.
     */
    closeDebugger(containerId) {
        if (this.registeredDebuggers.has(containerId)) {
            const clientDebugger = this.registeredDebuggers.get(containerId);
            if (clientDebugger === undefined) {
                console.warn(`No active client debugger associated with container ID "${containerId}" was found.`);
            }
            else {
                clientDebugger.dispose();
                this.registeredDebuggers.delete(containerId);
                this.emit("debuggerClosed", containerId);
            }
        }
        else {
            console.warn(`Fluid Client debugger never been registered.`);
        }
    }
    /**
     * Gets the registered client debugger associated with the provided Container ID if one is registered.
     * @returns the client debugger or undefined if not found.
     */
    getRegisteredDebuggers() {
        return this.registeredDebuggers;
    }
}
/**
 * Initializes a {@link IFluidClientDebugger} from the provided properties, binding it to the global context.
 *
 * @remarks
 *
 * If there is an existing debugger session associated with the provided {@link FluidClientDebuggerProps.containerId},
 * the existing debugger session will be closed, and a new one will be generated from the provided props.
 *
 * @public
 */
export function initializeFluidClientDebugger(props) {
    getDebuggerRegistry().initializeDebugger(props);
}
/**
 * Closes ({@link IFluidClientDebugger.dispose | disposes}) a registered client debugger associated with the
 * provided Container ID.
 *
 * @public
 */
export function closeFluidClientDebugger(containerId) {
    getDebuggerRegistry().closeDebugger(containerId);
}
/**
 * Gets the registered client debugger associated with the provided Container ID if one is registered.
 *
 * @remarks Will return `undefined` if no such debugger is registered.
 *
 * @internal
 */
export function getFluidClientDebugger(containerId) {
    const debuggerRegistry = getDebuggerRegistry().getRegisteredDebuggers();
    return debuggerRegistry.get(containerId);
}
/**
 * Gets all registered client debuggers from the registry.
 *
 * @internal
 */
export function getFluidClientDebuggers() {
    const debuggerRegistry = getDebuggerRegistry();
    const clientDebuggers = [];
    for (const [, clientDebugger] of debuggerRegistry.getRegisteredDebuggers()) {
        clientDebuggers.push(clientDebugger);
    }
    return clientDebuggers;
}
/**
 * Gets the debugger registry from the window. Initializes it if one does not yet exist.
 *
 * @throws Throws an error if initialization / binding to the window object fails.
 *
 * @internal
 */
export function getDebuggerRegistry() {
    if (globalThis.fluidClientDebuggersRegistry === undefined) {
        // If no client debuggers have been bound, initialize list
        globalThis.fluidClientDebuggersRegistry = new DebuggerRegistry();
    }
    const debuggerRegistry = globalThis.fluidClientDebuggersRegistry;
    if (debuggerRegistry === undefined) {
        throw new Error("Fluid Client debugger registry initialization failed.");
    }
    return debuggerRegistry;
}
/**
 * Clears the debugger registry, disposing of any remaining debugger objects.
 *
 * @internal
 */
export function clearDebuggerRegistry() {
    const debuggerRegistry = globalThis.fluidClientDebuggers;
    if (debuggerRegistry !== undefined) {
        for (const [, clientDebugger] of debuggerRegistry) {
            if (clientDebugger.disposed) {
                console.warn(`Fluid Client debugger has already been disposed.`);
            }
            else {
                clientDebugger.dispose();
            }
        }
    }
    globalThis.fluidClientDebuggers = undefined;
}
//# sourceMappingURL=Registry.js.map