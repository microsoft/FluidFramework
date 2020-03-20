/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";

export const generateClientId = (): string => uuid();
