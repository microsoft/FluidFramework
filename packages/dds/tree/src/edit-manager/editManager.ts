/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, Sequenced, Transposed } from "../changeset";
import { ChangeRebaser } from "../rebase";
import { AnchorSet } from "../tree";

export class EditManager<TChangeRebaser extends ChangeRebaser<any, any, any>> {
    public constructor(private readonly rebaser: TChangeRebaser) {
    }

    // TODO: The transaction type should be parameterized over the ChangeRebaser's changeset
    public addRemoteChanges(changes: Sequenced.Transaction[], anchors?: AnchorSet): Delta.Root {
        throw Error("Not implemented"); // TODO
    }

    public addLocalChanges(changes: Transposed.Transaction[]): void {
        throw Error("Not implemented"); // TODO
    }
}
