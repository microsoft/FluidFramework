/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousUser } from "./interfaces";

export class TinyliciousAudience extends EventEmitter implements ITinyliciousAudience {
  private readonly audience: IAudience;

  constructor(container: Container) {
    super();
    this.audience = container.audience;

    // Consolidating both the addition/removal of members
    this.audience.on("addMember", () => {
      this.emit("membersChanged", this.getMembers());
    });

    this.audience.on("removeMember", () => {
      this.emit("membersChanged", this.getMembers());
    });
  }

  /**
   * @inheritdoc
   */
  public getMembers(): TinyliciousUser[] {
    const users: TinyliciousUser[] = [];
    // Iterate through the members and get the user specifics.
    this.audience.getMembers().forEach((member: IClient, clientId: string) => {
      // Get all the current human members
      if (member.details.capabilities.interactive) {
        users.push({
          clientId,
          clientDetails: member.details,
          userDetails: {
            id: member.user.id ?? "",
          },
        });
      }
    });
    return users;
  }
}
