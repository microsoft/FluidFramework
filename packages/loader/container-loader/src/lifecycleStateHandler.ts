/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";

type LifecycleState = "created" | "loading" | "loaded" | "closing" | "closed";

export class LifecycleStateHandler {
    public get state(): LifecycleState {
        return this._state;
    }

    /**
     * Returns true if the container has been closed, otherwise false
     */
    public isClosed(): boolean {
        return (this._state === "closing" || this._state === "closed");
    }

    /**
     * Returns true if the container has been loaded, otherwise false
     */
    public isLoaded(): boolean {
        return (this._state !== "created" && this._state !== "loading");
    }

    /**
     * Transitions the container's lifecycle state
     */
    public changeState(newState: LifecycleState) {
        assert(newState !== "created", 0x2b9 /* "Changing container state to created is not allowed" */);
        let shouldChangeState: boolean = true;

        switch (newState) {
            case "loading":
                assert(this._state === "created", 0x2ba /* "Must be in created state before loading" */);
                break;
            case "loaded":
                assert(this._state !== "created",
                    0x27e /* "Must go through loading state before loaded" */);

                // It's conceivable the container could be closed when this is called
                // Only transition states if currently loading
                if (this._state !== "loading") {
                    shouldChangeState = false;
                }
                break;
            case "closed":
                assert(this._state === "closing", 0x2bb /* "Must go through closing state before closed" */);
                break;
            default: break;
        }

        if (shouldChangeState) {
            this._state = newState;
        }
    }

    constructor() {}

    private _state: LifecycleState = "created";
}
