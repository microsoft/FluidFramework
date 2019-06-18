/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import * as _ from "lodash";
import {
    IHostMethodMessage,
    IHostMethodObjectResult,
    IHostMethodResult,
    IHostMethodValueResult,
    MessageType,
    MethodResultType,
} from "./messages";

// TODO split up this file
// tslint:disable:max-classes-per-file

import * as postMessageSockets from "../post-message-sockets/index";

// TODO encapsulate the socket behavior within the host so it can handle the loss of the socket, etc...

export class ServiceWrapper {
    public methods: string[] = [];

    constructor(public id: number, private host: RemoteObjectManager, private service: any) {
        let test = _.forIn(service, (value, key) => {
            if (_.isFunction(value)) {
                this.methods.push(key);
            }
        });
    }

    public dispatch(
        methodName: string,
        args: any[],
        socket: postMessageSockets.IPostMessageSocket): Promise<IHostMethodResult> {
        if (!_.isFunction(this.service[methodName])) {
            return Promise.reject({ message: `${methodName} is not a function` });
        }

        let convertedArgs = args.map((arg) => this.host.unmarshall(arg, socket));

        // TODO have the args follow the same key/value as before
        let method = this.service[methodName] as Function;
        let resultP = method.apply(this.service, convertedArgs) as Promise<any>;

        return resultP.then((result) => this.host.marshall(result));
    }
}

export class RemoteService {
    constructor(
        private host: RemoteObjectManager,
        socket: postMessageSockets.IPostMessageSocket,
        objectId: number,
        methods: string[]) {
        // Bind all the defined methods to the object
        for (let method of methods) {
            this[method] = this.createRemoteMethod(socket, objectId, method);
        }
    }

    private createRemoteMethod(
        socket: postMessageSockets.IPostMessageSocket,
        objectId: number,
        method: string): (...args: any[]) => Promise<any> {
        return (...args: any[]) => {
            // Map from the args to our serialized forms
            let processedArgs = args.map((arg) => this.host.marshall(arg));

            let methodMessage: IHostMethodMessage = {
                args: processedArgs,
                methodName: method,
                objectId,
                type: MessageType.Method,
            };
            return socket.send<IHostMethodMessage, IHostMethodResult>(methodMessage)
                .then((result) => this.host.unmarshall(result, socket));
        };
    }
}

export class RemoteObjectManager {
    private nextObjectId = 0;

    private objectWrap: { [key: number]: ServiceWrapper } = {};

    public unmarshall(value: IHostMethodResult, socket: postMessageSockets.IPostMessageSocket): any {
        if (value.type === MethodResultType.Value) {
            return (<IHostMethodValueResult> value).value;
        } else {
            let objectResult = <IHostMethodObjectResult> value;
            return new RemoteService(this, socket, objectResult.value.objectId, objectResult.value.methods);
        }
    }

    public marshall(value: any): IHostMethodResult {
        if (_.isObject(value) && !_.isArray(value)) {
            // TODO if we recieve the same object consider looking it back up
            let wrappedObject = this.wrapService(value);
            return <IHostMethodObjectResult> {
                type: MethodResultType.Object,
                value: {
                    methods: wrappedObject.methods,
                    objectId: wrappedObject.id,
                },
            };
        } else {
            return <IHostMethodValueResult> {
                type: MethodResultType.Value,
                value,
            };
        }
    }

    public wrapService(service: any): ServiceWrapper {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectId = this.getNextObjectId();
        let objectWrap = new ServiceWrapper(objectId, this, service);
        this.objectWrap[objectWrap.id] = objectWrap;

        return objectWrap;
    }

    public dispatch(message: IHostMethodMessage, socket: postMessageSockets.IPostMessageSocket): Promise<any> {
        let objectWrap = this.objectWrap[message.objectId];
        if (!objectWrap) {
            return Promise.reject({ message: "Object not found" });
        } else {
            return objectWrap.dispatch(message.methodName, message.args, socket);
        }
    }

    private getNextObjectId() {
        return this.nextObjectId++;
    }
}
