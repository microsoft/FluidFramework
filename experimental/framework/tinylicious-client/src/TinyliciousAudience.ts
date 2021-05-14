/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluid-experimental/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousLastEditedResult, TinyliciousMember } from "./interfaces";

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
        if (users.has(userId)) {
          const existingValue = users.get(userId);
          if (existingValue) {
            existingValue.connectedClients.push({
              clientId,
              connectionMode: member.mode,
              timeLastActive: this.lastEditedTimesByClient.get(clientId),
            });
            existingValue.connectedClients.sort((a, b) =>
              (b.timeLastActive?.getMilliseconds() ?? 0) - (a.timeLastActive?.getMilliseconds() ?? 0));
          }
        } else {
          users.set(userId, {
            userId,
            userName: (member.user as any).name,
            connectedClients: [{
              clientId,
              connectionMode: member.mode,
              timeLastActive: this.lastEditedTimesByClient.get(clientId),
            }],
          });
        }
      }
    });
    return users;
  }

  /**
   * @inheritdoc
   */
  public getCurrentMember(): TinyliciousMember | undefined {
    return super.getCurrentMember() as TinyliciousMember;
  }

  /**
   * @inheritdoc
   */
  public getLastEdited(): TinyliciousLastEditedResult | undefined {
    const lastEditDetails = this.lastEditedTracker?.getLastEditDetails();
    if (lastEditDetails !== undefined) {
      const timestamp = new Date(lastEditDetails.timestamp);
      this.lastEditedTimesByClient.set(lastEditDetails.clientId, timestamp);
      const userId = lastEditDetails.user.id;
      const member: TinyliciousMember = {
        userId,
        userName: (lastEditDetails.user as any).name,
        connectedClients: this.getMembers().get(userId)?.connectedClients ?? [],
      };
      return { member, timestamp };
    }
  }
}
