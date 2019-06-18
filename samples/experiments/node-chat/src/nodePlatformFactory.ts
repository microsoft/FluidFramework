/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

export class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        return;
    }
}
