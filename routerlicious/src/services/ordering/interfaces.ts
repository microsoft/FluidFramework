import { IOrderer, IOrdererSocket } from "../../core";

export interface ISocketOrderer extends IOrderer {
    attachSocket(socket: IOrdererSocket);
}

export interface IConcreteNode {
    id: string;

    valid: boolean;

    send(message: any): void;
}

export interface IReservationManager {
    /**
     * Retrieves an existing reservation
     */
    getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode>;
}

export interface IConcreteNodeFactory {
    create(): Promise<IConcreteNode>;
}
