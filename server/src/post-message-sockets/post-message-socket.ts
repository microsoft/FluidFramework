import { Promise } from "es6-promise";
import { Deferred } from "../promise-utils/index";
import { IMessage, MessageType, PostMessageSocketProtocol } from "./messages";
import { PostMessageHost } from "./post-message-host";

export interface IPostMessageSocket {
    send<T, U>(input: T): Promise<U>;

    addEventListener(listener: (message: any) => Promise<any>);
}

/**
 * A socket for communicating over a postMessage channel
 */
export class PostMessageSocket implements IPostMessageSocket {
    private listener: (message: any) => Promise<any>;
    private messageMap: { [key: number]: Deferred<any> } = {};

    constructor(
        private host: PostMessageHost,
        private sourceId: number,
        private destId: number,
        private target: Window,
        private targetOrigin: string) {
    }

    /**
     * Sends a new message over the socket
     */
    public send<T, U>(data: T): Promise<U> {
        let messageId = this.postMessage(MessageType.Message, data);

        // And then record the message map so we can resolve the promise when we get a response
        let deferred = new Deferred<U>();
        this.messageMap[messageId] = deferred;

        return deferred.promise;
    }

    public processMessage(event: MessageEvent, message: IMessage) {
        // Validate the incoming event
        if (event.source !== this.target || event.origin !== this.targetOrigin) {
            console.error("Message received from invalid origin");
            return;
        }

        if (message.type === MessageType.Message) {
            this.processMessageReceipt(message);
        } else if (message.type === MessageType.Completion || message.type === MessageType.Failure) {
            this.processMessageResponse(message);
        } else {
            console.error("Unknown message type received");
        }
    }

    public processMessageReceipt(message: IMessage) {
        // reject the message if no listener is defined.
        // Alternatively if needed we could buffer messages until one is defined. But the former is simpler.  
        if (!this.listener) {
            this.postMessage(MessageType.Failure, { message: "No handler defined" });
            return;
        }

        // Ivoke the callback and then return the response over the socket
        let resultP = this.listener(message.data);
        resultP.then(
            (result) => {
                this.postMessage(MessageType.Completion, result);
            },
            (error) => {
                this.postMessage(MessageType.Failure, error);
            });
    }

    public processMessageResponse(message: IMessage) {
        let deferred = this.messageMap[message.messageId];
        if (!deferred) {
            console.error("Unknown message response");
            return;
        }
        delete this.messageMap[message.messageId];

        if (message.type === MessageType.Completion) {
            deferred.resolve(message.data);
        } else {
            deferred.reject(message.data);
        }
    }

    /**
     * Sets the event listener to receive messages
     */
    public addEventListener(listener: (message: any) => Promise<any>) {
        this.listener = listener;
    }

    private postMessage(type: MessageType, data: any): number {
        let message: IMessage = {
            data,
            destId: this.destId,
            messageId: this.host.getMessageId(),
            protocolId: PostMessageSocketProtocol,
            sourceId: this.sourceId,
            type,
        };
        this.target.postMessage(message, this.targetOrigin);

        return message.messageId;
    }
}
