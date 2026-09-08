/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- This module is the CommonJS boundary for misauthored @fluentui packages. */

// @fluentui packages are misauthored to declare ESM support ("module" field in package.json).
// Import them via CJS to avoid importing ESM modules that don't have "type": "module"
// or .mjs extension.
// See @fluentui issue 30778 -- https://github.com/microsoft/fluentui/issues/30778 (closed)
// and overall issue 23508 -- https://github.com/microsoft/fluentui/issues/23508
//
// Note that type-only imports are immune to this issue. But workaround is required for runtime imports.

// eslint-disable-next-line no-restricted-imports -- provides MessageBar, MessageBarType, initializeIcons
import FluentReact = require("@fluentui/react");
import FluentReactComponents = require("@fluentui/react-components");
import FluentReactIcons = require("@fluentui/react-icons");

export { FluentReact, FluentReactComponents, FluentReactIcons };
