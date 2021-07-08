/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluid-experimental/fluid-framework";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousMember } from "./interfaces";

export class TinyliciousAudience extends ServiceAudience implements ITinyliciousAudience {
  /**
   * @inheritdoc
   */
  public getMembers(): Map<string, TinyliciousMember> {
    const users = new Map<string, TinyliciousMember>();
    // Iterate through the members and get the user specifics.
    this.audience.getMembers().forEach((member: IClient, clientId: string) => {
      // Get all the current human members
      if (member.details.capabilities.interactive) {
        const userId = member.user.id;
        // Ensure we're tracking the user
        let user = users.get(userId);
        if (user === undefined) {
            user = {
              userId,
              userName: (member.user as any).name,
              connections: [],
            };
            users.set(userId, user);
        }
        // Add this connection to their collection
        user.connections.push({ id: clientId, mode: member.mode });
      }
    });
    return users;
  }

  /**
   * @inheritdoc
   */
  public getMyself(): TinyliciousMember | undefined {
    return super.getMyself() as TinyliciousMember;
  }

  /**
   * @inheritdoc
   */
   public getMemberByClientId(clientId: string): TinyliciousMember | undefined {
    return super.getMemberByClientId(clientId) as TinyliciousMember;
  }
}
