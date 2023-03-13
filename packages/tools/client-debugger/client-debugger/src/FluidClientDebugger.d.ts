/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IFluidClientDebugger, IFluidClientDebuggerEvents } from "./IFluidClientDebugger";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";
import { FluidClientDebuggerProps } from "./Registry";
/**
 * {@link IFluidClientDebugger} implementation.
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for:**
 *
 * - {@link GetContainerStateMessage}: When received (if the container ID matches), the debugger will broadcast {@link ContainerStateChangeMessage}.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link ContainerStateChangeMessage}: This is posted any time relevant Container state changes,
 * or when requested (via {@link GetContainerStateMessage}).
 *
 * TODO: Document others as they are added.
 *
 * @sealed
 * @internal
 */
export declare class FluidClientDebugger extends TypedEventEmitter<IFluidClientDebuggerEvents> implements IFluidClientDebugger {
    /**
     * {@inheritDoc IFluidClientDebugger.containerId}
     */
    readonly containerId: string;
    /**
     * {@inheritDoc FluidClientDebuggerProps.container}
     */
    readonly container: IContainer;
    /**
     * {@inheritDoc FluidClientDebuggerProps.audience}
     */
    get audience(): IAudience;
    /**
     * {@inheritDoc IFluidClientDebugger.containerData}
     */
    readonly containerData?: IFluidLoadable | Record<string, IFluidLoadable>;
    /**
     * {@inheritDoc IFluidClientDebugger.containerNickname}
     */
    readonly containerNickname?: string;
    /**
     * Accumulated data for {@link IFluidClientDebugger.getContainerConnectionLog}.
     */
    private readonly _connectionStateLog;
    /**
     * Accumulated data for {@link IFluidClientDebugger.getAudienceHistory}.
     */
    private readonly _audienceChangeLog;
    private readonly containerAttachedHandler;
    private readonly containerConnectedHandler;
    private readonly containerDisconnectedHandler;
    private readonly containerClosedHandler;
    private readonly containerDisposedHandler;
    private readonly audienceMemberAddedHandler;
    private readonly audienceMemberRemovedHandler;
    /**
     * Handlers for inbound messages related to the debugger.
     */
    private readonly inboundMessageHandlers;
    /**
     * Event handler for messages coming from the window (globalThis).
     */
    private readonly windowMessageHandler;
    /**
     * Posts a {@link ContainerStateChangeMessage} to the window (globalThis).
     */
    private readonly postContainerStateChange;
    /**
     * Posts a {@link AudienceEventMessage} to the window (globalThis)
     *
     */
    private readonly postAudienceStateChange;
    private readonly debuggerDisposedHandler;
    /**
     * Message logging options used by the debugger.
     */
    private get messageLoggingOptions();
    /**
     * Whether or not the instance has been disposed yet.
     *
     * @remarks Not related to Container disposal.
     *
     * @see {@link IFluidClientDebugger.dispose}
     */
    private _disposed;
    constructor(props: FluidClientDebuggerProps);
    /**
     * {@inheritDoc IFluidClientDebugger.getConnectionStateLog}
     */
    getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[];
    /**
     * {@inheritDoc IFluidClientDebugger.getAudienceHistory}
     */
    getAudienceHistory(): readonly AudienceChangeLogEntry[];
    /**
     * {@inheritDoc IFluidClientDebugger.dispose}
     */
    dispose(): void;
    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
     */
    get disposed(): boolean;
    private getContainerState;
}
//# sourceMappingURL=FluidClientDebugger.d.ts.map