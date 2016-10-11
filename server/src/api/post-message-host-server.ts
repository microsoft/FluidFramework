import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';

export class PostMessageHostServer {
    private _host: postMessageSockets.IPostMessageHost;

    // This server should define some core capabilities and then expose access to them via some messaging protocol flow...

    constructor(private _window: Window) {
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        this._host.listen((connection) => {
            console.log('Received a new connection');

            connection.addEventListener((message) => {
                return Promise.resolve(message);
            })
        });
    }
}