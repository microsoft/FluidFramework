/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Driver Error types
 * Lists types that are likely to be used by all drivers
 */
export var DriverErrorType;
(function (DriverErrorType) {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    DriverErrorType["genericError"] = "genericError";
    /**
     * Some non-categorized (below) networking error
     * Include errors like  fatal server error (usually 500).
     */
    DriverErrorType["genericNetworkError"] = "genericNetworkError";
    /**
     * Access denied - user does not have enough privileges to open a file, or continue to operate on a file
     */
    DriverErrorType["authorizationError"] = "authorizationError";
    /**
     * File not found, or file deleted during session
     */
    DriverErrorType["fileNotFoundOrAccessDeniedError"] = "fileNotFoundOrAccessDeniedError";
    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    DriverErrorType["throttlingError"] = "throttlingError";
    /**
     * We can not reach server due to computer being offline.
     */
    DriverErrorType["offlineError"] = "offlineError";
    /*
     * Unsupported client protocol
     */
    DriverErrorType["unsupportedClientProtocolVersion"] = "unsupportedClientProtocolVersion";
    /**
     * User does not have write permissions to a file, but is changing content of a file.
     * That might be indication of some data store error - data stores should not generate ops in readonly mode.
     */
    DriverErrorType["writeError"] = "writeError";
    /**
     * Generic fetch failure.
     * Most of such failures are due to client being offline, or DNS is not reachable, such errors map to
     * DriverErrorType.offlineError. Anything else that can't be diagnose as likely offline maps to this error.
     * This can also indicate no response from server.
     */
    DriverErrorType["fetchFailure"] = "fetchFailure";
    /**
     * Unexpected response from server. Either JSON is malformed, or some required properties are missing
     */
    DriverErrorType["incorrectServerResponse"] = "incorrectServerResponse";
})(DriverErrorType || (DriverErrorType = {}));
//# sourceMappingURL=driverError.js.map