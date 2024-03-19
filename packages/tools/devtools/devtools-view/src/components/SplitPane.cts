/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// react-split-pane only exports SplitPane as 'default' and needs imported
// as CommonJS. Otherwise, under full ESM transpilation:
//   JSX element type 'SplitPane' does not have any construct or call signatures.ts(2604)

import SplitPane from "react-split-pane";

// eslint-disable-next-line unicorn/prefer-export-from
export { SplitPane };
