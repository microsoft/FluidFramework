/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IConnectedClient, IServiceAudience, IMember } from "./types";
import { RootDataObject } from "./rootDataObject";

// Base class for providing audience information for sessions interacting with FluidContainer
// This can be extended by different service-specific client packages to additional parameters to
// the user and client details returned in IMember
export class ServiceAudience extends EventEmitter implements IServiceAudience<IMember> {
  protected readonly audience: IAudience;

  // Maintains a map of the last edited times keyed by client ID after the current client
  // joined the session
  // TODO: This will only maintain the list of edits made after the current client has joined.
  // We would need an additional DataObject to support storing the last edited state from history
  protected readonly lastEditedTimesByClient = new Map<string, Date>();

  constructor(
      protected readonly container: Container,
      rootDataObject: RootDataObject,
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

    // Update the last edited information anytime the root object emits an op by a member
    // of the current audience. This in turn emits a "lastEditedChanged" event so that
    // any listeners can update their state to reflect the changes
    rootDataObject.on("op", (message: ISequencedDocumentMessage) => {
      this.lastEditedTimesByClient.set(message.clientId, new Date(message.timestamp));
      const member = this.getMemberByClientId(
        message.clientId,
      );
      if (member !== undefined) {
        this.emit("lastEditedChanged", { member, timestamp :new Date(message.timestamp) });
      }
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
  public getMyClient(): IConnectedClient | undefined {
    const clientId = this.container.clientId;
    if (clientId === undefined) {
      return undefined;
    }
    const client = this.audience.getMember(clientId);
    if (client === undefined) {
      throw Error(`Failed to find client ${clientId} even after it is connected`);
    }
    return {
      clientId,
      connectionMode: client.mode,
      timeLastActive: this.lastEditedTimesByClient.get(clientId),
    };
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

  private getMemberByClientId(clientId: string): IMember | undefined {
    // Fetch the user ID assoicated with this client ID from the runtime
    const internalAudienceMember = this.audience.getMember(clientId);
    if (internalAudienceMember === undefined) {
      return undefined;
    }
    // Return the member object with any other clients associated for this user
    const allMembers = this.getMembers();
    const lastEditedMember = allMembers.get(internalAudienceMember?.user.id);
    if (lastEditedMember === undefined) {
      throw Error(`Attempted to fetch client ${clientId} that is not part of the current member list`);
    }
    return lastEditedMember;
  }
}
