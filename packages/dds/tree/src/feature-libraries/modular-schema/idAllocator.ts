/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../../util";
import { ChangesetLocalId } from "./fieldChangeHandler";

export type IdAllocator = () => ChangesetLocalId;

export function idAllocatorFromMaxId(maxId: ChangesetLocalId | undefined = undefined): IdAllocator {
    let currId = maxId ?? -1;
    return () => {
        return brand(++currId);
    };
}
