/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Note } from "./Note";

export const restNoteMidiNumber = -1;

export interface Song {
    noteSequence: Note[];
}
