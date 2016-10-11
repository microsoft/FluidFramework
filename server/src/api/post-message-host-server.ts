import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { ITable, ITableService } from './interfaces';
import * as _ from 'lodash';

/**
 * This can be the actual interface that will be provided to the serverf
 */
class TableService implements ITableService {
    createTable(): Promise<ITable> {
        return Promise.reject("not implemented");
    }
}

class ServiceWrapper {
    constructor(service: any) {
        // Walk the service and find all the methods on it. We'll identify them by name.        
    }

    dispatch(message: IHostMessage) {
        // Convert from the incoming message to the wrapped service message. 

        // Then on the promise

        // For return types that are objects create another wrapper around them. create
        // an ID for them, etc...                
    }
}

export class PostMessageHostServer {
    private _host: postMessageSockets.IPostMessageHost;

    private _services: { [name: string]: any } = {};

    // This server should define some core capabilities and then expose access to them via some messaging protocol flow...

    // I want to add things that implement the given interface but are agnostic to the transport protocol

    constructor(private _window: Window) {
    }

    addService(name: string, service: any) {
        this._services[name] = service;

        // Provide a unique identifier for the service object

        // I should walk the method on the service and provider wrappers for them
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        this._host.listen((connection) => {
            console.log('Received a new connection');

            // TODO I need some way to return the messages

            connection.addEventListener((message: IHostMessage) => {
                if (message.type === MessageType.Init) {
                    // The init message will be called first - the host will return back the supported services           
                }
                else {
                    // The client is looking to invoke a method on one of the provided services
                    // Lookup the object id - and invoke the method
                }

                return Promise.reject("not implemented");
            })
        });
    }
}

export enum MessageType {
    // Initialization message to the host
    Init,

    // Method invocation on the host
    Method
}

export interface IHostMessage {
    type: MessageType;
}

export interface IHostMethodMessage extends IHostMessage {
    // Target object identifier
    objectId: number;

    // method name to invoke
    methodName: string;

    // arguments to pass to the method
    args: any[];
}