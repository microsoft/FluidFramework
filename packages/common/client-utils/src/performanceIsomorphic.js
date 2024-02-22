"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.performance = void 0;
/**
 * This exported "performance" member masks the built-in globalThis.performance object
 * as an IsomorphicPerformance, which hides all of its features that aren't compatible
 * between Node and browser implementations.  Anything exposed on this performance object
 * is considered safe to use regarless of the environment it runs in.
 *
 * @internal
 */
exports.performance = globalThis.performance;
//# sourceMappingURL=performanceIsomorphic.js.map