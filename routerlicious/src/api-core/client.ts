export const Browser = "browser";

export const Robot = "robot";

export interface IWorkerClient {

    type: string;

    permission: string[];
}

export interface IWorkerClientDetail {

    clientId: string;

    detail: IWorkerClient;
}
