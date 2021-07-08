/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Check if the package.json defines a Fluid package
 * @param pkg - the package json data to check if it is a Fluid package.
 */
export const isFluidPackage = (pkg) => typeof pkg === "object"
    && typeof (pkg === null || pkg === void 0 ? void 0 : pkg.name) === "string"
    && typeof (pkg === null || pkg === void 0 ? void 0 : pkg.fluid) === "object";
export const isFluidCodeDetails = (details) => {
    const maybeCodeDetails = details;
    return typeof maybeCodeDetails === "object"
        && (typeof (maybeCodeDetails === null || maybeCodeDetails === void 0 ? void 0 : maybeCodeDetails.package) === "string" || isFluidPackage(maybeCodeDetails === null || maybeCodeDetails === void 0 ? void 0 : maybeCodeDetails.package))
        && ((maybeCodeDetails === null || maybeCodeDetails === void 0 ? void 0 : maybeCodeDetails.config) === undefined || typeof (maybeCodeDetails === null || maybeCodeDetails === void 0 ? void 0 : maybeCodeDetails.config) === "object");
};
export const IFluidCodeDetailsComparer = "IFluidCodeDetailsComparer";
//# sourceMappingURL=fluidPackage.js.map