/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import {
    ISharedDirectory,
} from "@microsoft/fluid-map";

export interface IVltavaDataModel {
    getDefaultComponent(): Promise<IComponent>;
    getTitle(): string;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    constructor(
        public readonly root: ISharedDirectory,
        private readonly context: IComponentContext,
        public readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        private readonly getComponent: (id: string) => Promise<IComponent>,
    ) {
        super();
    }

    public async getDefaultComponent(): Promise<IComponent> {
        const defaultComponentId = this.root.get<string>("default-component-id");
        return this.getComponent(defaultComponentId);
    }

    public getTitle(): string {
        return this.context.documentId;
    }
}
