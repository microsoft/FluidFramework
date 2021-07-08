/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Additional key in the loader request header
 */
export var DriverHeader;
(function (DriverHeader) {
    // Key to indicate whether the request for summarizer
    DriverHeader["summarizingClient"] = "fluid-client-summarizer";
    // createNew information, specific to each driver
    DriverHeader["createNew"] = "createNew";
})(DriverHeader || (DriverHeader = {}));
//# sourceMappingURL=urlResolver.js.map