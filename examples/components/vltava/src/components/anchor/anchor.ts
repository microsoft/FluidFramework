/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentHTMLVisual,
    IProvideComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IConsensusRegisterCollection,
} from "@microsoft/fluid-register-collection";
import {
    ConsensusQueue,
} from "@microsoft/fluid-ordered-collection";

import uuid from "uuid/v4";

enum componentKeys {
    defaultComponentId
}

/**
 * Anchor is an default component is responsible for managing creation and the default component
 */
export class Anchor extends PrimedComponent implements IProvideComponentHTMLVisual {
    private readonly defaultComponentQueue = "defaultComponentQueue";

    private readonly initializationCollectionInternal: IConsensusRegisterCollection | undefined;
    private defaultComponentInternal: IComponentHTMLVisual | undefined;

    public get initializationCollection(): IConsensusRegisterCollection {
        if (!this.initializationCollectionInternal) {
            throw new Error("Initialization Collection was not initialized properly");
        }

        return this.initializationCollectionInternal;
    }

    private get defaultComponent(): IComponentHTMLVisual {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private static readonly factory = new PrimedComponentFactory(Anchor, [
        ConsensusQueue.getFactory(),
    ]);

    public static getFactory() {
        return Anchor.factory;
    }

    public get IComponentHTMLVisual() { return this.defaultComponent; }

    protected async componentInitializingFirstTime(props: any) {

        const queue = ConsensusQueue.create<keyof componentKeys>(this.runtime, this.defaultComponentQueue);
        this.root.set(this.defaultComponentQueue, queue.handle);

        const keysP: Promise<void>[] = [];
        Object.keys(componentKeys).forEach((key) => {
            keysP.push(queue.add(key as keyof componentKeys));
        });

        await Promise.all(keysP);
        await this.ensureInitialComponents(queue);
    }

    protected async componentInitializingFromExisting() {
        const queue = await this.root.get<IComponentHandle>(this.defaultComponentQueue).get<ConsensusQueue>();
        await this.ensureInitialComponents(queue);
    }

    protected async componentHasInitialized() {
        this.defaultComponentInternal =
            await this.root.get<IComponentHandle>(componentKeys[componentKeys.defaultComponentId]).get();
    }

    private async ensureInitialComponents(queue: ConsensusQueue<keyof componentKeys>): Promise<void> {
        let item = await queue.remove();
        while (item) {
            await this.createComponent(componentKeys[item]);
            item = await queue.remove();
        }
    }

    private async createComponent(id: componentKeys): Promise<void> {
        switch(id) {
            case componentKeys.defaultComponentId: {
                const defaultComponent = await this.createAndAttachComponent<IComponent>(uuid(), "vltava");
                this.root.set(componentKeys[componentKeys.defaultComponentId], defaultComponent.IComponentHandle);
                break;
            }
            default:
                break;
        }
    }
}
