/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import { IEchoService } from "../api/index";

export class BrowserEchoService implements IEchoService {
    public echo(data: string): Promise<string> {
        return Promise.resolve(`Echo: ${data}`);
    }
}
