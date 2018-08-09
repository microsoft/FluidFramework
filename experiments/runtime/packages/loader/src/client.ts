export const Browser = "browser";
export const Robot = "robot";

export interface IClient {
    type: string;

    permission: string[];
}

export interface IClientDetail {
    clientId: string;

    detail: IClient;
}
