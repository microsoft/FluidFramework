/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideComponentConfiguration,
    IProvideComponentRunnable,
} from "./componentLoadable";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface IComponent extends
    Readonly<Partial<
        & IProvideComponentRunnable
        & IProvideComponentConfiguration
    >>{ }
/* eslint-enable @typescript-eslint/no-empty-interface */
