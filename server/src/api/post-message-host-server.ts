import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { ITable, ITableService } from './interfaces';
import * as _ from 'lodash';
import {
    IHostMethodResult,
    IWrappedService,
    IHostMethodValueResult,
    IHostMethodObjectResult,
    MethodResultType,
    IHostMessage,
    MessageType,
    IHostMethodMessage
} from './messages';
import { RemoteObjectManager } from './remote-object-manager';

export class PostMessageHostServer {
    private _host: postMessageSockets.IPostMessageHost;
    private _manager = new RemoteObjectManager();
    private _services: { [name: string]: IWrappedService } = {};

    constructor(private _window: Window) {
    }

    addService(name: string, service: any) {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectWrap = this._manager.wrapService(service);
        this._services[name] = { objectId: objectWrap.id, methods: objectWrap.methods };
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        this._host.listen((connection) => {
            console.log('Received a new connection');

            connection.addEventListener((message: IHostMessage) => {
                if (message.type === MessageType.Init) {
                    return Promise.resolve({ services: this._services });
                }
                else {
                    let hostMethodMessage = message as IHostMethodMessage;
                    return this._manager.dispatch(hostMethodMessage, connection);
                }
            })
        });
    }
}