/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousMember } from "./interfaces";

export class TinyliciousAudience extends ServiceAudience<TinyliciousMember> implements ITinyliciousAudience {
  /**
   * @internal
   */
  protected createServiceMember(audienceMember: IClient): TinyliciousMember {
    return {
      userId: audienceMember.user.id,
      userName: (audienceMember.user as any).name,
      connections: [],
    };
  }
}
