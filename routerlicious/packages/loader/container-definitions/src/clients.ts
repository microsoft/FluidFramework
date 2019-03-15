import { IUser } from "./users";

export const Browser = "browser";

export interface IClient {
    type: string;
    permission: string[];
    user: IUser;
}

export interface ISequencedClient {

    client: IClient;

    sequenceNumber: number;
}

/**
 * Contents sent with a ClientJoin message
 */
export interface IClientJoin {
    // The ID of the joining client
    clientId: string;

    // Details about the joining client (i.e. browser based, server, CPU, memory, etc...)
    detail: IClient;
}
