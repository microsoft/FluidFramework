import { Promise } from 'es6-promise';
import { Deferred } from './promiseUtils';

export enum MessageType {
    Connect,
    ConnectAck,
    Data
}

export interface IMessage {
    type: MessageType;
}

export interface IDataMessage extends IMessage {
    data: any;
}

/**
 * Host end of an interactive document. The host creates and manages the lifetime of an interactive document.
 */
export class InteractiveDocumentHost {
    private _connected = new Deferred<void>();
    private _listeners: ((data: any) => void)[] = [];

    constructor(private _window: Window, private _target: Window) {
    }

    connect(): Promise<void> {
        console.log("Host: Listening");
        this._window.addEventListener(
            'message',
            (event) => this.eventListener(event),
            false);

        return Promise.resolve();
    }

    private eventListener(event: MessageEvent) {
        // Only accept messages from the provided source
        if (event.source !== this._target) {
            return;
        }

        let message = event.data as IMessage;
        if (message.type === MessageType.Connect) {
            console.log("Host: Connected - Acknowledging");
            let responseMessage: IMessage = { type: MessageType.ConnectAck };
            this._target.postMessage(responseMessage, '*');
            this._connected.resolve();
        }
        else if (message.type === MessageType.Data) {
            let dataMessage = message as IDataMessage;
            for (let listener of this._listeners) {
                listener(dataMessage.data);
            }
        }
    }

    send(data: any) {
        this._connected.promise.then(() => {
            console.log("sending some data");
            let message: IDataMessage = { type: MessageType.Data, data: data };
            this._target.postMessage(message, '*');
        })
    }

    addListener(listener: (data: any) => void) {
        this._listeners.push(listener);
    }
}

/**
 * The interactive document itself. Managed by a corresponding host which manages its lifetime and sends messages.
 */
export class InteractiveDocument {
    private _connected = new Deferred<void>();
    private _listeners: ((data: any) => void)[] = [];

    constructor(private _window: Window, private _target: Window) {
    }

    connect(): Promise<void> {
        console.log("Document: Listening");
        this._window.addEventListener(
            'message',
            (event) => this.eventListener(event),
            false);

        console.log("Document: Starting connection");
        let message: IMessage = { type: MessageType.Connect };
        this._target.postMessage(message, '*');

        return Promise.resolve();
    }

    private eventListener(event: MessageEvent) {
        // Only accept messages from the provided source
        if (event.source !== this._target) {
            return;
        }

        let message = event.data as IMessage;
        if (message.type === MessageType.ConnectAck) {
            console.log("Document: Connected");
            this._connected.resolve();
        }
        else if (message.type === MessageType.Data) {
            let dataMessage = message as IDataMessage;
            for (let listener of this._listeners) {
                listener(dataMessage.data);
            }
        }
    }

    send(data: any) {
        this._connected.promise.then(() => {
            let message: IDataMessage = { type: MessageType.Data, data: data };
            this._target.postMessage(message, '*');
        })
    }

    addListener(listener: (data: any) => void) {
        this._listeners.push(listener);
    }
}