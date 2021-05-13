/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { RootDataObject } from "@fluid-experimental/fluid-static";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IConnectedClient, ITinyliciousAudience, TinyliciousMember } from "./interfaces";

export class TinyliciousAudience extends EventEmitter implements ITinyliciousAudience {
  private readonly audience: IAudience;
  private readonly lastEditedTimesByClient = new Map<string, Date>();

  constructor(private readonly container: Container, rootDataObject: RootDataObject) {
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

    rootDataObject.on("op", (message) => {
      const lastEditedMember = this.getLastEditedMember(message);
      if (lastEditedMember !== undefined) {
        this.emit("lastEditedMemberChanged", lastEditedMember);
      }
    });
  }

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
              (a.timeLastActive?.getMilliseconds() ?? 0) - (b.timeLastActive?.getMilliseconds() ?? 0));
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
  public getCurrentClient(): IConnectedClient | undefined {
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
  public getCurrentMember(): TinyliciousMember | undefined {
    const clientId = this.container.clientId;
    if (clientId === undefined) {
      return undefined;
    }
    const userId = this.audience.getMember(clientId)?.user.id;
    if (userId === undefined) {
      return undefined;
    }
    const allMembers = this.getMembers();
    const currentMember = allMembers.get(userId);
    if (currentMember === undefined) {
      throw Error(`Failed to find user ${userId} in current audience roster`);
    }
    return currentMember;
  }

  private getLastEditedMember(message: ISequencedDocumentMessage): TinyliciousMember | undefined {
    // Fetch the full details from the runtime of the client that made this edit or return undefined
    // if the client is not yet connected
    const internalAudienceMember = this.audience.getMember(message.clientId);
    if (internalAudienceMember === undefined) {
      return undefined;
    }
    const isInteractiveOp = internalAudienceMember.details.capabilities.interactive;
    // If it is an interactive client, we will update the last edited time for that client
    if (isInteractiveOp !== undefined && isInteractiveOp) {
      this.lastEditedTimesByClient.set(message.clientId, new Date(message.timestamp));

      // With the last edited times updated, we will now return the user object that includes
      // the updated last modified timestamp in its list of connected clients
      const allMembers = this.getMembers();
      const lastEditedMember = allMembers.get(internalAudienceMember?.user.id);
      if (lastEditedMember === undefined) {
        throw Error("Last change was made by a member who is not part of the current member list");
      }
      return lastEditedMember;
    }
  }
}
