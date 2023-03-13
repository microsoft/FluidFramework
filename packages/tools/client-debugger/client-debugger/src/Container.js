/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Kind of container state change.
 *
 * @internal
 */
export var ContainerStateChangeKind;
(function (ContainerStateChangeKind) {
    /**
     * Container is attached to the Fluid service.
     */
    ContainerStateChangeKind["Attached"] = "attached";
    /**
     * Container completes connecting to the Fluid service.
     */
    ContainerStateChangeKind["Connected"] = "connected";
    /**
     * Container becomes disconnected from the Fluid service.
     */
    ContainerStateChangeKind["Disconnected"] = "disconnected";
    /**
     * Container is disposed, which permanently disables it. Resources disposed.
     */
    ContainerStateChangeKind["Disposed"] = "disposed";
    /**
     * Container is closed. No new activity will occur, but resources might not been disposed yet.
     */
    ContainerStateChangeKind["Closed"] = "closed";
})(ContainerStateChangeKind || (ContainerStateChangeKind = {}));
//# sourceMappingURL=Container.js.map