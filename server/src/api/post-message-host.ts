import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { IHost } from './host';
import { IEchoService, ITableService, ITable } from './interfaces';
import * as _ from 'lodash';
import { IHostMessage, IHostMethodMessage, MessageType, MethodResultType, IInitResult, IHostMethodResult, IHostMethodValueResult, IHostMethodObjectResult } from './messages';

class RemoteService {
    constructor(socket: postMessageSockets.IPostMessageSocket, objectId: number, methods: string[]) {
        // Bind all the defined methods to the object
        for (let method of methods) {
            this[method] = RemoteService.CreateRemoteMethod(socket, objectId, method);
        }
    }

    private static CreateRemoteMethod(socket: postMessageSockets.IPostMessageSocket, objectId: number, method: string): (...args: any[]) => Promise<any> {
        return (...args: any[]) => {
            let methodMessage: IHostMethodMessage = {
                type: MessageType.Method,
                objectId: objectId,
                methodName: method,
                args: args
            };
            return socket.send<IHostMethodMessage, IHostMethodResult>(methodMessage).then((result) => {
                if (result.type === MethodResultType.Value) {
                    return (<IHostMethodValueResult>result).value;
                }
                else {
                    let objectResult = <IHostMethodObjectResult>result;
                    return new RemoteService(socket, objectResult.value.objectId, objectResult.value.methods);
                }
            });
        };
    }
}

/**
 * PostMessage implementation of the IHost interface. This hosts assumes it can connect to its
 * parent to receive messages.
 */
export class PostMessageHost implements IHost {
    private _host: postMessageSockets.IPostMessageHost;
    private _socketP: Promise<postMessageSockets.IPostMessageSocket>;
    private _interfacesP: Promise<{ [name: string]: RemoteService }>;

    constructor(private _window: Window) {
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        // TODO for security we may need to define a set of allowed hosts - especially if the iframe conveys secret information to the host
        this._socketP = this._host.connect(window.parent, '*');
        this._interfacesP = this._socketP.then((socket) => {
            let initMessage: IHostMessage = { type: MessageType.Init };
            return socket.send<IHostMessage, IInitResult>(initMessage).then((result) => {
                let services: { [name: string]: RemoteService } = {};
                for (let name in result.services) {
                    let serviceDefinition = result.services[name];
                    services[name] = new RemoteService(socket, serviceDefinition.objectId, serviceDefinition.methods);
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