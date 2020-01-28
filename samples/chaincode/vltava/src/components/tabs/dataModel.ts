/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISharedDirectory,
} from "@microsoft/fluid-map";

export interface ITabsDataModel {
    getComponent(id: string): Promise<IComponent>;
}

export class TabsDataModel extends EventEmitter implements ITabsDataModel {
    constructor(
        public readonly root: ISharedDirectory,
        public readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        public getComponent: (id: string) => Promise<IComponent>,
    ) {
        super();
    }
}
