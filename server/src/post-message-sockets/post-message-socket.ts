// TODO convert me
// tslint:disable

import { MessageType, PostMessageSocketProtocol, IMessage } from './messages';
import { Promise } from 'es6-promise';
import { Deferred } from '../promise-utils/index';
import { PostMessageHost } from './post-message-host';

export interface IPostMessageSocket {
    send<T, U>(input: T): Promise<U>;

    addEventListener(listener: (message: any) => Promise<any>)
}

/**
 * A socket for communicating over a postMessage channel
 */
export class PostMessageSocket implements IPostMessageSocket {
    private _listener: (message: any) => Promise<any>;
    private _messageMap: { [key: number]: Deferred<any> } = {};

    constructor(
        private _host: PostMessageHost,
        private sourceId: number,
        private destId: number,
        private target: Window,
        private targetOrigin: string) {
    }

    /**
     * Sends a new message over the socket
     */
    send<T, U>(data: T): Promise<U> {
        let messageId = this.postMessage(MessageType.Message, data);

        // And then record the message map so we can resolve the promise when we get a response
        let deferred = new Deferred<U>();
        this._messageMap[messageId] = deferred;

        return deferred.promise;
    }

    processMessage(event: MessageEvent, message: IMessage) {
        // Validate the incoming event
        if (event.source !== this.target || event.origin !== this.targetOrigin) {
            console.log("Message received from invalid origin");
            return;
        }

        if (message.type === MessageType.Message) {
            this.processMessageReceipt(message);
        }
        else if (message.type === MessageType.Completion || message.type === MessageType.Failure) {
            this.processMessageResponse(message);
        }
        else {
            console.log("Unknown message type received");
        }
    }

    private postMessage(type: MessageType, data: any): number {
        let message: IMessage = {
            protocolId: PostMessageSocketProtocol,
            type: type,
            sourceId: this.sourceId,
            destId: this.destId,
            messageId: this._host.getMessageId(),
            data: data
        };
        this.target.postMessage(message, this.targetOrigin);

        return message.messageId;
    }

    processMessageReceipt(message: IMessage) {
        // reject the message if no listener is defined.
        // Alternatively if needed we could buffer messages until one is defined. But the former is simpler.  
        if (!this._listener) {
            this.postMessage(MessageType.Failure, { message: "No handler defined" });
            return;
        }

        // Ivoke the callback and then return the response over the socket
        let resultP = this._listener(message.data);
        resultP.then(
            (result) => {
                this.postMessage(MessageType.Completion, result);
            },
            (error) => {
                this.postMessage(MessageType.Failure, error);
            })
    }

    processMessageResponse(message: IMessage) {
        let deferred = this._messageMap[message.messageId];
        if (!deferred) {
            console.log("Unknown message response");
            return;
        }
        delete this._messageMap[message.messageId];

        if (message.type === MessageType.Completion) {
            deferred.resolve(message.data);
        }
        else {
            deferred.reject(message.data);
        }
    }

    /**
     * Sets the event listener to receive messages
     */
    addEventListener(listener: (message: any) => Promise<any>) {
        this._listener = listener;
    }
}