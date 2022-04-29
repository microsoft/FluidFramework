/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReference } from "@fluidframework/merge-tree";
import { debug } from "../document/debug";
import { FlowDocument } from "../document/index";

export function updateRef(doc: FlowDocument, ref: LocalReference, position: number) {
    if (isNaN(position)) {
        debug(`      ${position} (ignored)`);
        return ref;
    }

    if (!ref) {
        debug(`      ${position} (new ref)`);
        return doc.addLocalRef(position);
    }

    const oldPosition = doc.localRefToPosition(ref);
    if (!(position !== oldPosition)) {
        debug(`      ${position} (unchanged)`);
        return ref;
    }

    debug(`      ${position} (was: ${oldPosition})`);

    doc.removeLocalRef(ref);
    return doc.addLocalRef(position);
}

export function extractRef(doc: FlowDocument, ref: LocalReference) {
    const position = doc.localRefToPosition(ref);
    doc.removeLocalRef(ref);
    return position;
}
