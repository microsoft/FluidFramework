export const Browser = "browser";

export interface IClient {

    type: string;

    permission: string[];
}

export interface IClientDetail {

    clientId: string;

    detail: IClient;
}
