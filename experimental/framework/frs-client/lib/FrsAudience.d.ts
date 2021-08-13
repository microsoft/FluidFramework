/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ServiceAudience } from "@fluid-experimental/fluid-framework";
import { IClient } from "@fluidframework/protocol-definitions";
import { IFrsAudience, FrsMember } from "./interfaces";
export declare class FrsAudience extends ServiceAudience<FrsMember> implements IFrsAudience {
    protected createServiceMember(audienceMember: IClient): FrsMember;
}
//# sourceMappingURL=FrsAudience.d.ts.map