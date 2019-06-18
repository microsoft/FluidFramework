/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, ITokenService } from "@prague/container-definitions";
import * as jwtDecode from "jwt-decode";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwtDecode(token);
    }
}
