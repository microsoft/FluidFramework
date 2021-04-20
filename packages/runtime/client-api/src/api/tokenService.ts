/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, ITokenService } from "@fluidframework/protocol-definitions";
import jwtDecode from "jwt-decode";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwtDecode(token);
    }
}
