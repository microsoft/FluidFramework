/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
} from "@fluidframework/component-core-interfaces";
import { IDirectoryValueChanged } from "@fluidframework/map";
import { IEvent } from "@fluidframework/common-definitions";
import {
    PrimedComponent,
} from "@fluidframework/aqueduct";

/**
 * PrimedComponent is a base component that is primed with a root directory and task manager. It
 * ensures that both are created and ready before you can access it.
 *
 * Having a single root directory allows for easier development. Instead of creating
 * and registering channels with the runtime any new DDS that is set on the root
 * will automatically be registered.
 *
 * Generics:
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export abstract class ListenedComponent<P extends IComponent = object, S = undefined, E extends IEvent = IEvent>
    extends PrimedComponent<P, S, E>
{
    public addListenerToRootValueChanged(
        listener: (
            changed: IDirectoryValueChanged,
            local: boolean,
        ) => void,
    ): void {
        this.root.on("valueChanged", listener);
    }

    public get IComponentListened() { return this; }
}
