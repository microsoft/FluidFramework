/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* Exports for internal use only
 * This is only used during transition of legacy+alpha code to internal.
 * Here there are conflicts between index reexports with deprecations and clean internal versions.
 * In cases where * exports conflict with named exports, the named exports take precedence per
 * https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-getexportednames.
 * This does trigger the `import/export` lint warning (which is intentionally disabled here). This
 * approach ensures that a non-deprecated version of ContainerRuntime (provided as named direct
 * export) eclipses the deprecated one from `./index.ts`.
 * Alternatively, another file could be created for external exports adding ContainerRuntime and
 * they'd share common exports files (the rest of current index.ts).
 */
/* eslint-disable import/export */
/* eslint-disable import/no-deprecated */

// eslint-disable-next-line no-restricted-syntax
export * from "./index.js";
import { ContainerRuntime as ContainerRuntimeClass } from "./containerRuntime.js";
export type ContainerRuntime = ContainerRuntimeClass;
export const ContainerRuntime = ContainerRuntimeClass;
