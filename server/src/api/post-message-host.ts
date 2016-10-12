import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { IHost } from './host';
import { IEchoService, ITableService, ITable } from './interfaces';
import * as _ from 'lodash';
import { IHostMessage, IHostMethodMessage, MessageType, MethodResultType, IInitResult, IHostMethodResult, IHostMethodValueResult, IHostMethodObjectResult } from './messages';
import { RemoteObjectManager, RemoteService } from './remote-object-manager';

/**
 * PostMessage implementation of the IHost interface. This hosts assumes it can connect to its
 * parent to receive messages.
 */
export class PostMessageHost implements IHost {
    private _host: postMessageSockets.IPostMessageHost;
    private _socketP: Promise<postMessageSockets.IPostMessageSocket>;
    private _interfacesP: Promise<{ [name: string]: RemoteService }>;
    private _manager = new RemoteObjectManager();

    constructor(private _window: Window) {
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        // TODO for security we may need to define a set of allowed hosts - especially if the iframe conveys secret information to the host
        this._socketP = this._host.connect(window.parent, '*');

        // Listen to incoming connections and dispatch to the manager
        this._socketP.then((socket) => {
            // I should probably do this automatically
            socket.addEventListener((message) => {
                return this._manager.dispatch(message as IHostMethodMessage, socket);
            })
        })

        // Retrieve the available interfaces
        this._interfacesP = this._socketP.then((socket) => {
            let initMessage: IHostMessage = { type: MessageType.Init };
            return socket.send<IHostMessage, IInitResult>(initMessage).then((result) => {
                let services: { [name: string]: RemoteService } = {};
                for (let name in result.services) {
                    let serviceDefinition = result.services[name];
                    services[name] = new RemoteService(this._manager, socket, serviceDefinition.objectId, serviceDefinition.methods);
                }

                return services;
            });
        });
    }

    /**
     * Retrieves the list of interfaces supported by the host
     */
    listServices(): Promise<string[]> {
        return this._interfacesP.then((interfaces) => {
            return _.keys(interfaces);
        });
    }

    /**
     * Detects if the given interface is supported - if so returns a reference to it
     */
    getService<T>(name: string): Promise<T> {
        // does this call need to give me back something I can route from?
        return this._interfacesP.then((interfaces) => {
            if (!_.has(interfaces, name)) {
                throw { message: "Not supported" };
            }

            // Cast to any so we can cast our generated wrapper class to T
            let object = <T>(<any>interfaces[name]);

            return object;
        });
    }
}