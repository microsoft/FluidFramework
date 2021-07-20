/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { isFluidPackage } from "@fluidframework/core-interfaces";
/**
 * Determines if any object is an IFluidBrowserPackage
 * @param maybePkg - The object to check for compatibility with IFluidBrowserPackage
 */
export const isFluidBrowserPackage = (maybePkg) => {
    var _a, _b, _c, _d, _e, _f;
    return isFluidPackage(maybePkg)
        && typeof ((_c = (_b = (_a = maybePkg === null || maybePkg === void 0 ? void 0 : maybePkg.fluid) === null || _a === void 0 ? void 0 : _a.browser) === null || _b === void 0 ? void 0 : _b.umd) === null || _c === void 0 ? void 0 : _c.library) === "string"
        && Array.isArray((_f = (_e = (_d = maybePkg === null || maybePkg === void 0 ? void 0 : maybePkg.fluid) === null || _d === void 0 ? void 0 : _d.browser) === null || _e === void 0 ? void 0 : _e.umd) === null || _f === void 0 ? void 0 : _f.files);
};
//# sourceMappingURL=browserPackage.js.map