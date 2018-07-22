import * as api from "../../api-core";
import { IOrderer, IOrdererConnection, IWebSocket } from "../../core";

export interface IOrdererConnectionFactory {
    connect(socket: IWebSocket, user: api.ITenantUser, client: api.IClient): Promise<IOrdererConnection>;
}

/**
 * Proxies ordering to an external service which does the actual ordering
 */
export class ProxyOrderer implements IOrderer {
    constructor(private factory: IOrdererConnectionFactory) {
    }

    public async connect(
        socket: IWebSocket,
        user: api.ITenantUser,
        client: api.IClient): Promise<IOrdererConnection> {

        const proxiedSocket = await this.factory.connect(socket, user, client);
        return proxiedSocket;
    }
}
