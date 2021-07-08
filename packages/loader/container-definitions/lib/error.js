/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Different error types the Container may report out to the Host
 */
export var ContainerErrorType;
(function (ContainerErrorType) {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    ContainerErrorType["genericError"] = "genericError";
    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    ContainerErrorType["throttlingError"] = "throttlingError";
    /**
     * Data loss error detected by Container / DeltaManager. Likely points to storage issue.
     */
    ContainerErrorType["dataCorruptionError"] = "dataCorruptionError";
})(ContainerErrorType || (ContainerErrorType = {}));
//# sourceMappingURL=error.js.map