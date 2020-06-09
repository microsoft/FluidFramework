/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGraphUser, IMicrosoftGraph } from "@fluidframework/host-service-interfaces";
import Axios from "axios";

export class MicrosoftGraph implements IMicrosoftGraph {
    public get IMicrosoftGraph(): IMicrosoftGraph { return this; }

    constructor(private readonly accessToken: string) {
    }

    public async me(): Promise<IGraphUser> {
        const me = await Axios.get(
            "https://graph.microsoft.com/v1.0/me/",
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }
}
