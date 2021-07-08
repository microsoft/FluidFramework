/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IClient } from "@fluidframework/protocol-definitions";
import { IServiceAudience, IServiceAudienceEvents, IMember } from "./types";

// Base class for providing audience information for sessions interacting with FluidContainer
// This can be extended by different service-specific client packages to additional parameters to
// the user and client details returned in IMember
export class ServiceAudience
  extends TypedEventEmitter<IServiceAudienceEvents<IMember>>
  implements IServiceAudience<IMember> {
  protected readonly audience: IAudience;

  constructor(
      protected readonly container: Container,
  ) {
    super();
    this.audience = container.audience;

    // Consolidating both the addition/removal of members
    this.audience.on("addMember", () => {
      this.emit("membersChanged", this.getMembers());
    });

    this.audience.on("removeMember", () => {
      this.emit("membersChanged", this.getMembers());
    });

    this.container.on("connected", () => {
      this.emit("membersChanged", this.getMembers());
    });
  }

  /**
   * @inheritdoc
   */
  public getMembers(): Map<string, IMember> {
    const users = new Map<string, IMember>();
    // Iterate through the members and get the user specifics.
    this.audience.getMembers().forEach((member: IClient, clientId: string) => {
      // Get all the current human members
      if (member.details.capabilities.interactive) {
        const userId = member.user.id;
        // Ensure we're tracking the user
        let user = users.get(userId);
        if (user === undefined) {
            user = { userId, connections: [] };
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
  public getMyself(): IMember | undefined {
    const clientId = this.container.clientId;
    if (clientId === undefined) {
      return undefined;
    }
    return this.getMemberByClientId(clientId);
  }

  public getMemberByClientId(clientId: string): IMember | undefined {
    // Fetch the user ID assoicated with this client ID from the runtime
    const internalAudienceMember = this.audience.getMember(clientId);
    if (internalAudienceMember === undefined) {
      return undefined;
    }
    // Return the member object with any other clients associated for this user
    const allMembers = this.getMembers();
    const member = allMembers.get(internalAudienceMember?.user.id);
    if (member === undefined) {
      throw Error(`Attempted to fetch client ${clientId} that is not part of the current member list`);
    }
    return member;
  }
}
