/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// We assume the current script runs at the base path. Simply extract out its filename and then use that path
// as the base
const base = (document.currentScript as HTMLScriptElement).src;

// Need to also set webpack_public_path on the window given the below bug
// https://github.com/Microsoft/monaco-editor-webpack-plugin/issues/7
// eslint-disable-next-line dot-notation
window["__webpack_public_path__"] = __webpack_public_path__ = base.substr(0, base.lastIndexOf("/") + 1);

export { };
