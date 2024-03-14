/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { v4 as uuid } from "uuid";

/**
 * @internal
 */
export const generateClientId = (): string => uuid();
