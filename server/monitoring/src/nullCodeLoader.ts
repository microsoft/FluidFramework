/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeLoader } from "@microsoft/fluid-container-definitions";

export class NullCodeLoader implements ICodeLoader {
    public async load<T>(pkg: string): Promise<T> {
        return;
    }
}
