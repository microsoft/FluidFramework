/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { RootDataObject } from "@fluid-experimental/fluid-static";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidLastEditedTracker } from "@fluidframework/last-edited-experimental";
import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IConnectedClient, ILastEditedResult, ITinyliciousAudience, TinyliciousMember } from "./interfaces";

export class TinyliciousAudience extends EventEmitter implements ITinyliciousAudience {
  private readonly audience: IAudience;

  // Data object that holds the last edited state and is used to load the data prior to the
  // current client joining the session
  private readonly lastEditedTracker: IFluidLastEditedTracker | undefined;

  // Maintains a map of the last edited times keyed by client ID after the current client
  // joined the session
  private readonly lastEditedTimesByClient = new Map<string, Date>();

  constructor(private readonly container: Container, rootDataObject: RootDataObject) {
    super();
    this.audience = container.audience;
    this.lastEditedTracker = rootDataObject.IFluidLastEditedTracker;

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

    rootDataObject.on("op", (message: ISequencedDocumentMessage) => {
      this.lastEditedTimesByClient.set(message.clientId, new Date(message.timestamp));
      const member = this.getMemberByClientId(
        message.clientId,
      );
      if (member !== undefined) {
        this.emit("lastEditedChanged", { member, timestamp :new Date(message.timestamp) });
      }
    });

    const lastEditDetails = this.lastEditedTracker?.getLastEditDetails();
    if (lastEditDetails !== undefined) {
      const timestamp = new Date(lastEditDetails.timestamp);
      this.lastEditedTimesByClient.set(lastEditDetails.clientId, timestamp);
      const userId = lastEditDetails.user.id;
      const member: TinyliciousMember = {
        userId,
        connectedClients: this.getMembers().get(userId)?.connectedClients ?? [],
      };
      this.emit("lastEditedChanged", { member, timestamp });
    }

    const lastEditedMemberResults = this.getLastEdited();
    if (lastEditedMemberResults !== undefined) {
      this.emit("lastEditedChanged", lastEditedMemberResults);
    }
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
    return this.getMemberByClientId(clientId);
  }

  /**
   * @inheritdoc
   */
  public getLastEdited(): ILastEditedResult<TinyliciousMember> | undefined {
    const lastEditDetails = this.lastEditedTracker?.getLastEditDetails();
    if (lastEditDetails !== undefined) {
      const timestamp = new Date(lastEditDetails.timestamp);
      this.lastEditedTimesByClient.set(lastEditDetails.clientId, timestamp);
      const userId = lastEditDetails.user.id;
      const member: TinyliciousMember = {
        userId,
        connectedClients: this.getMembers().get(userId)?.connectedClients ?? [],
      };
      return { member, timestamp };
    }
  }

  private getMemberByClientId(clientId: string): TinyliciousMember | undefined {
    // Fetch the full details from the runtime of the client that made this edit or return undefined
    // if the client is not yet connected
    const internalAudienceMember = this.audience.getMember(clientId);
    if (internalAudienceMember === undefined) {
      return undefined;
    }
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
