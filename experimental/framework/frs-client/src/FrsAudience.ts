/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@fluidframework/protocol-definitions";
import { ServiceAudience } from "fluid-framework";
import { IFrsAudience, FrsMember } from "./interfaces";

export class FrsAudience extends ServiceAudience<FrsMember> implements IFrsAudience {
  protected createServiceMember(audienceMember: IClient): FrsMember {
    return {
      userId: audienceMember.user.id,
      userName: (audienceMember.user as any).name,
      connections: [],
      additionalDetails: (audienceMember.user as any).additionalDetails,
    };
  }
}
