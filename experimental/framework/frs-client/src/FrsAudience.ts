/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluid-experimental/fluid-framework";
import { IClient } from "@fluidframework/protocol-definitions";
import { IFrsAudience, FrsMember } from "./interfaces";

export class FrsAudience extends ServiceAudience<FrsMember> implements IFrsAudience {
  protected createServiceMember(audienceMember: IClient): FrsMember {
    return {
      userId: audienceMember.user.id,
      userName: (audienceMember.user as any).name,
      connections: [],
    };
  }
}
