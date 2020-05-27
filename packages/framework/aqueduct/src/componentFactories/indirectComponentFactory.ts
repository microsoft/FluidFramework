/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    IComponent,
    IComponentLoadable,
} from "@fluidframework/component-core-interfaces";
import {
    IComponentContext,
    IComponentFactory,
} from "@fluidframework/runtime-definitions";

import { SharedComponentFactory } from "./sharedComponentFactory";

/**
 * A component factory that delegates factory component creation to another factory
 * based on a decision lambda
 *
 * S is an optional initial state type that all constituent factories must accept
 * D is an optional decision argument type that must be matched when creating a component
 */
export class IndirectComponentFactory<
    S = undefined,
    D = undefined>
    implements IComponentFactory
{
    private defaultSelectionFn = (
        registryEntries: [Promise<SharedComponentFactory<{}, S>>],
        decisionArgs?: D,
    ): Promise<SharedComponentFactory<{}, S>> => {
        return registryEntries[0];
    }

    constructor(
        // The general class of components
        public readonly type: string,
        private readonly registryEntries: [Promise<SharedComponentFactory<{}, S>>],
        private readonly selectionFn?: (
            registryEntries: [Promise<SharedComponentFactory<{}, S>>],
            decisionArgs?: D,
        ) => Promise<SharedComponentFactory<{}, S>>,
    ) {
        assert(registryEntries.length > 0);
        if (this.selectionFn === undefined)
        {
            this.selectionFn = this.defaultSelectionFn;
        }
    }

    public get IComponentFactory() { return this; }

    public async createComponent(
        context: IComponentContext,
        initialState?: S,
        decisionArgs?: D,
    ): Promise<IComponent & IComponentLoadable> {
        const matchedFactory = await this.selectionFn!(this.registryEntries, decisionArgs);
        return matchedFactory.createComponent(context, initialState);
    }

    public instantiateComponent(context: IComponentContext): void {
    }
}
