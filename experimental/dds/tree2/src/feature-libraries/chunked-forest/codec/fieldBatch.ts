/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous } from "../../../core";

/**
 * Collection of field cursors to compress as a batch.
 * Cursors must be in fields mode.
 */
export type FieldBatch = readonly ITreeCursorSynchronous[];
