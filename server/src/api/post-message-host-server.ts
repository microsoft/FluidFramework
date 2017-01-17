import { Promise } from "es6-promise";
import * as postMessageSockets from "../post-message-sockets/index";
import { ITable, ITableService } from "./interfaces";
import {
    IHostMessage,
    IHostMethodMessage,
    IHostMethodObjectResult,
    IHostMethodResult,
    IHostMethodValueResult,
    IWrappedService,
    MessageType,
    MethodResultType,
} from "./messages";
import { RemoteObjectManager } from "./remote-object-manager";

export class PostMessageHostServer {
    private host: postMessageSockets.IPostMessageHost;
    private manager = new RemoteObjectManager();
    private services: { [name: string]: IWrappedService } = {};

    constructor(private window: Window) {
    }

    public addService(name: string, service: any) {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectWrap = this.manager.wrapService(service);
        this.services[name] = { objectId: objectWrap.id, methods: objectWrap.methods };
    }

    public start() {
        this.host = postMessageSockets.getOrCreateHost(this.window);
        this.host.listen((connection) => {
            connection.addEventListener((message: IHostMessage) => {
                if (message.type === MessageType.Init) {
                    return Promise.resolve({ services: this.services });
                } else {
                    let hostMethodMessage = message as IHostMethodMessage;
                    return this.manager.dispatch(hostMethodMessage, connection);
                }
            });
        });
    }
}
