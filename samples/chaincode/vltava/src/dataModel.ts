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

}

export class VltavaDataModel extends EventEmitter {

    constructor(
        public readonly root: ISharedDirectory,
        public readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        public getComponent: (id: string) => Promise<IComponent>,
    ) {
        super();
    }
}
