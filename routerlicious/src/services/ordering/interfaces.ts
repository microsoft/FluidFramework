import { IOrderer, IOrdererSocket } from "../../core";

export interface ISocketOrderer extends IOrderer {
    attachSocket(socket: IOrdererSocket);
}
