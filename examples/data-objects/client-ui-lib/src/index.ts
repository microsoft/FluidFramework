/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Packaging and re-exporting of fluid UI framework

import * as controls from "./controls";
import * as Text from "./text";
import * as ui from "./ui";

export { ui };

export { controls };

// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { CharacterCodes, Paragraph, Table } from "./text";
export { CharacterCodes, Paragraph, Table };

export { Text };
