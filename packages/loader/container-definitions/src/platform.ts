/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

/**
 * The platform interface exposes access to underlying pl
 * @deprecated being removed in favor of QI on container-definitions IComponent
 */
export interface IPlatform extends EventEmitter {
    /**
     * Queries the platform for an interface of the given ID.
     */
    queryInterface<T>(id: string): Promise<T>;

    /**
     * Detaches the given platform
     */
    detach();
}
