/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { register } from "node:module";

// Register CSS loader so that CSS imports (e.g. quill-next/dist/quill.snow.css) resolve to empty modules
register("./cssLoader.js", import.meta.url);
