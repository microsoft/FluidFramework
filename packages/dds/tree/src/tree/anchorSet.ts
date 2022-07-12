/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand } from "../util";
import { UpPath } from "./pathTree";

/**
 * A way to refer to a particular tree location within a {@link Rebaser} instance's revision.
 */
 export type Anchor = Brand<number, "rebaser.Anchor">;

/**
 * Collection of Anchors at a specific revision.
 *
 * See {@link Rebaser} for how to update across revisions.
 */

export class AnchorSet {
    public constructor() {
        throw Error("Not implemented"); // TODO
    }

    /**
     * TODO: support extra/custom return types for specific anchor types:
     * for now caller must rely on data in anchor + returned node location
     * (not ideal for anchors for places or ranges instead of nodes).
     */
    public locate(anchor: Anchor): UpPath | undefined {
        throw Error("Not implemented"); // TODO
    }

    public forget(anchor: Anchor): void {
        throw Error("Not implemented"); // TODO
    }

    /**
     * TODO: add API to UpPath (maybe extend as AnchorPath to allow building without having to copy here?)
     */
    public track(path: UpPath): Anchor {
        throw Error("Not implemented"); // TODO
    }
}
