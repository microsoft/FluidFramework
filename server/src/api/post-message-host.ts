import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { IHost } from './host';
import { IEchoService } from './interfaces';
import * as _ from 'lodash';

class PostMessageEcho implements IEchoService {
    constructor(private _socket: postMessageSockets.IPostMessageSocket) {
    }

    echo(data: string): Promise<string> {
        return this._socket.send(data);
    }
}

/**
 * PostMessage implementation of the IHost interface. This hosts assumes it can connect to its
 * parent to receive messages.
 */
export class PostMessageHost implements IHost {
    private _host: postMessageSockets.IPostMessageHost;
    private _socketP: Promise<postMessageSockets.IPostMessageSocket>;
    private _interfacesP: Promise<{ [name: string]: any }>;

    constructor(private _window: Window) {
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        // TODO for security we may need to define a set of allowed hosts - especially if the iframe conveys secret information to the host
        this._socketP = this._host.connect(window.parent, '*');
        this._interfacesP = this._socketP.then((socket) => {            
            return { "echo": new PostMessageEcho(socket) };
        });
    }

    /**
     * Retrieves the list of interfaces supported by the host
     */
    listInterfaces(): Promise<string[]> {
        return this._interfacesP.then((interfaces) => {
            return _.keys(interfaces);
        });      
    }

    /**
     * Detects if the given interface is supported - if so returns a reference to it
     */
    queryInterface<T>(name: string): Promise<T> {
        // does this call need to give me back something I can route from?
        return this._interfacesP.then((interfaces) => {
            let iface = interfaces[name];
            if (!iface) {
                throw { message: "Not supported" };
            }

            return iface as T;
        });
    }
}