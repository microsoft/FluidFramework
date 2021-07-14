/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluid-experimental/fluid-framework";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousMember } from "./interfaces";

export class TinyliciousAudience extends ServiceAudience<TinyliciousMember> implements ITinyliciousAudience {
  protected createServiceMember(audienceMember: IClient): TinyliciousMember {
    return {
      userId: audienceMember.user.id,
      userName: (audienceMember.user as any).name,
      connections: [],
    };
  }
}
