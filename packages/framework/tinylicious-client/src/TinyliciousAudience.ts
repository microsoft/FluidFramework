/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousMember, TinyliciousUser } from "./interfaces";

/**
 * {@inheritDoc ITinyliciousAudience}
 */
export class TinyliciousAudience extends ServiceAudience<TinyliciousMember> implements ITinyliciousAudience {
  /**
   * @internal
   */
  protected createServiceMember(audienceMember: IClient): TinyliciousMember {
    const tinyliciousUser = audienceMember.user as TinyliciousUser;
    assert(
        tinyliciousUser !== undefined && typeof tinyliciousUser.name === "string",
        "Specified user was not of type \"TinyliciousUser\".");

    return {
      userId: tinyliciousUser.id,
      userName: tinyliciousUser.name,
      connections: [],
    };
  }
}
