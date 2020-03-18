/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as uuid from "uuid";

export const generateClientId = (): string =>
    `trevor${uuid()}`;
