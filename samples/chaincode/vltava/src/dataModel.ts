/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISharedDirectory,
    // IDirectory,
    // IDirectoryValueChanged,
} from "@microsoft/fluid-map";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IVltavaDataModel {
    getDefaultComponent(): Promise<IComponent>;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    constructor(
        public readonly root: ISharedDirectory,
        public readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        public getComponent: (id: string) => Promise<IComponent>,
    ) {
        super();
    }

    public async getDefaultComponent(): Promise<IComponent> {
        const defaultComponentId = this.root.get<string>("default-component-id");
        return this.getComponent(defaultComponentId);
    }
}
