/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// We assume the current script runs at the base path. Simply extract out its filename and then use that path
// as the base
const base = (document.currentScript as HTMLScriptElement).src;
__webpack_public_path__ = base.substr(0, base.lastIndexOf("/") + 1);

export {};
