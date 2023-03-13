/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerStateChangeKind } from "./Container";
import { debuggerMessageSource, handleIncomingWindowMessage, postMessageToWindow, } from "./messaging";
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
export class FluidClientDebugger extends TypedEventEmitter {
    constructor(props) {
        var _a;
        super();
        // #endregion
        // #region Container-related event handlers
        this.containerAttachedHandler = () => {
            this.postContainerStateChange();
            this._connectionStateLog.push({
                newState: ContainerStateChangeKind.Attached,
                timestamp: Date.now(),
                clientId: undefined,
            });
        };
        this.containerConnectedHandler = (clientId) => {
            this.postContainerStateChange();
            this._connectionStateLog.push({
                newState: ContainerStateChangeKind.Connected,
                timestamp: Date.now(),
                clientId,
            });
        };
        this.containerDisconnectedHandler = () => {
            this.postContainerStateChange();
            this._connectionStateLog.push({
                newState: ContainerStateChangeKind.Disconnected,
                timestamp: Date.now(),
                clientId: undefined,
            });
        };
        this.containerClosedHandler = () => {
            this.postContainerStateChange();
            this._connectionStateLog.push({
                newState: ContainerStateChangeKind.Closed,
                timestamp: Date.now(),
                clientId: undefined,
            });
        };
        this.containerDisposedHandler = () => {
            this.postContainerStateChange();
            this._connectionStateLog.push({
                newState: ContainerStateChangeKind.Disposed,
                timestamp: Date.now(),
                clientId: undefined,
            });
        };
        // #endregion
        // #region Audience-related event handlers
        this.audienceMemberAddedHandler = (clientId, client) => {
            this._audienceChangeLog.push({
                clientId,
                client,
                changeKind: "added",
                timestamp: Date.now(),
            });
            this.postAudienceStateChange();
        };
        this.audienceMemberRemovedHandler = (clientId, client) => {
            this._audienceChangeLog.push({
                clientId,
                client,
                changeKind: "removed",
                timestamp: Date.now(),
            });
            this.postAudienceStateChange();
        };
        // #endregion
        // #region Window event handlers
        /**
         * Handlers for inbound messages related to the debugger.
         */
        this.inboundMessageHandlers = {
            ["GET_CONTAINER_STATE"]: (untypedMessage) => {
                const message = untypedMessage;
                if (message.data.containerId === this.containerId) {
                    this.postContainerStateChange();
                    return true;
                }
                return false;
            },
            ["GET_AUDIENCE_EVENT"]: (untypedMessage) => {
                const message = untypedMessage;
                if (message.data.containerId === this.containerId) {
                    this.postAudienceStateChange();
                    return true;
                }
                return false;
            },
        };
        /**
         * Event handler for messages coming from the window (globalThis).
         */
        this.windowMessageHandler = (event) => {
            handleIncomingWindowMessage(event, this.inboundMessageHandlers, this.messageLoggingOptions);
        };
        /**
         * Posts a {@link ContainerStateChangeMessage} to the window (globalThis).
         */
        this.postContainerStateChange = () => {
            postMessageToWindow({
                source: debuggerMessageSource,
                type: "CONTAINER_STATE_CHANGE",
                data: {
                    containerId: this.containerId,
                    containerState: this.getContainerState(),
                },
            }, this.messageLoggingOptions);
        };
        /**
         * Posts a {@link AudienceEventMessage} to the window (globalThis)
         *
         */
        this.postAudienceStateChange = () => {
            console.log("---------------------------------------");
            console.log("this.container.audience.getMembers():", this.container.audience.getMembers());
            console.log("---------------------------------------");
            console.log("this.getAudienceHistory():", this.getAudienceHistory());
            console.log("---------------------------------------");
            postMessageToWindow({
                source: debuggerMessageSource,
                type: "AUDIENCE_EVENT",
                data: {
                    containerId: this.containerId,
                    audienceState: this.container.audience.getMembers(),
                    audienceHistory: this.getAudienceHistory(),
                },
            }, this.messageLoggingOptions);
            console.log("Passed Post");
        };
        // #endregion
        this.debuggerDisposedHandler = () => this.emit("disposed");
        this.containerId = props.containerId;
        this.containerData = props.containerData;
        this.container = props.container;
        this.containerNickname = props.containerNickname;
        // TODO: would it be useful to log the states (and timestamps) at time of debugger initialize?
        this._connectionStateLog = [];
        this._audienceChangeLog = [];
        // Bind Container events required for change-logging
        this.container.on("attached", this.containerAttachedHandler);
        this.container.on("connected", this.containerConnectedHandler);
        this.container.on("disconnected", this.containerDisconnectedHandler);
        this.container.on("disposed", this.containerDisposedHandler);
        this.container.on("closed", this.containerClosedHandler);
        // Bind Audience events required for change-logging
        this.audience.on("addMember", this.audienceMemberAddedHandler);
        this.audience.on("removeMember", this.audienceMemberRemovedHandler);
        // Register listener for inbound messages from the window (globalThis)
        (_a = globalThis.addEventListener) === null || _a === void 0 ? void 0 : _a.call(globalThis, "message", this.windowMessageHandler);
        this._disposed = false;
    }
    /**
     * {@inheritDoc FluidClientDebuggerProps.audience}
     */
    get audience() {
        return this.container.audience;
    }
    /**
     * Message logging options used by the debugger.
     */
    get messageLoggingOptions() {
        return { context: `Debugger(${this.containerId})` };
    }
    /**
     * {@inheritDoc IFluidClientDebugger.getConnectionStateLog}
     */
    getContainerConnectionLog() {
        // Clone array contents so consumers don't see local changes
        return this._connectionStateLog.map((value) => value);
    }
    /**
     * {@inheritDoc IFluidClientDebugger.getAudienceHistory}
     */
    getAudienceHistory() {
        // Clone array contents so consumers don't see local changes
        return this._audienceChangeLog.map((value) => value);
    }
    /**
     * {@inheritDoc IFluidClientDebugger.dispose}
     */
    dispose() {
        var _a;
        // Unbind Container events
        this.container.off("attached", this.containerAttachedHandler);
        this.container.off("connected", this.containerConnectedHandler);
        this.container.off("disconnected", this.containerDisconnectedHandler);
        this.container.off("disposed", this.containerDisposedHandler);
        this.container.off("closed", this.containerClosedHandler);
        // Unbind Audience events
        this.audience.off("addMember", this.audienceMemberAddedHandler);
        this.audience.off("removeMember", this.audienceMemberRemovedHandler);
        // Unbind window event listener
        (_a = globalThis.removeEventListener) === null || _a === void 0 ? void 0 : _a.call(globalThis, "message", this.windowMessageHandler);
        this.debuggerDisposedHandler(); // Notify consumers that the debugger has been disposed.
        this._disposed = true;
    }
    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
     */
    get disposed() {
        return this._disposed;
    }
    getContainerState() {
        var _a;
        const clientId = this.container.clientId;
        return {
            id: this.containerId,
            nickname: this.containerNickname,
            attachState: this.container.attachState,
            connectionState: this.container.connectionState,
            closed: this.container.closed,
            clientId: this.container.clientId,
            audienceId: clientId === undefined ? undefined : (_a = this.audience.getMember(clientId)) === null || _a === void 0 ? void 0 : _a.user.id,
        };
    }
}
//# sourceMappingURL=FluidClientDebugger.js.map