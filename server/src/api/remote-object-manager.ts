import {
    IHostMethodMessage,
    IHostMethodResult,
    IHostMethodValueResult,
    IHostMethodObjectResult,
    MessageType,
    MethodResultType
} from './messages';
import { Promise } from 'es6-promise';
import * as _ from 'lodash';
import * as postMessageSockets from '../post-message-sockets/index';

export class ServiceWrapper {
    public methods: string[] = [];

    constructor(public id: number, private _host: RemoteObjectManager, private _service: any) {
        let test = _.forIn(_service, (value, key) => {
            if (_.isFunction(value)) {
                this.methods.push(key);
            }
        });
    }

    dispatch(methodName: string, args: any[], socket: postMessageSockets.IPostMessageSocket): Promise<IHostMethodResult> {
        if (!_.isFunction(this._service[methodName])) {
            return Promise.reject({ message: `${methodName} is not a function` });
        }

        let convertedArgs = args.map((arg) => this._host.unmarshall(arg, socket));

        // TODO have the args follow the same key/value as before
        let method = this._service[methodName] as Function;
        let resultP = method.apply(this._service, convertedArgs) as Promise<any>;

        return resultP.then((result) => this._host.marshall(result));
    }
}

export class RemoteService {
    constructor(private _host: RemoteObjectManager, socket: postMessageSockets.IPostMessageSocket, objectId: number, methods: string[]) {
        // Bind all the defined methods to the object
        for (let method of methods) {
            this[method] = this.createRemoteMethod(socket, objectId, method);
        }
    }

    private createRemoteMethod(socket: postMessageSockets.IPostMessageSocket, objectId: number, method: string): (...args: any[]) => Promise<any> {
        return (...args: any[]) => {
            // Map from the args to our serialized forms
            let processedArgs = args.map((arg) => this._host.marshall(arg));

            let methodMessage: IHostMethodMessage = {
                type: MessageType.Method,
                objectId: objectId,
                methodName: method,
                args: processedArgs
            };
            return socket.send<IHostMethodMessage, IHostMethodResult>(methodMessage).then((result) => this._host.unmarshall(result, socket));
        };
    }
}

export class RemoteObjectManager {
    private _nextObjectId = 0;

    private _objectWrap: { [key: number]: ServiceWrapper } = {};

    private getNextObjectId() {
        return this._nextObjectId++;
    }

    unmarshall(value: IHostMethodResult, socket: postMessageSockets.IPostMessageSocket): any {
        if (value.type === MethodResultType.Value) {
            return (<IHostMethodValueResult>value).value;
        }
        else {
            let objectResult = <IHostMethodObjectResult>value;
            return new RemoteService(this, socket, objectResult.value.objectId, objectResult.value.methods);
        }
    }

    marshall(value: any): IHostMethodResult {
        if (_.isObject(value) && !_.isArray(value)) {
            // TODO if we recieve the same object consider looking it back up
            let wrappedObject = this.wrapService(value);
            return <IHostMethodObjectResult>{
                type: MethodResultType.Object,
                value: {
                    objectId: wrappedObject.id,
                    methods: wrappedObject.methods
                }
            };
        }
        else {
            return <IHostMethodValueResult>{
                type: MethodResultType.Value,
                value: value
            };
        }
    }

    wrapService(service: any): ServiceWrapper {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectId = this.getNextObjectId();
        let objectWrap = new ServiceWrapper(objectId, this, service);
        this._objectWrap[objectWrap.id] = objectWrap;

        return objectWrap;
    }

    dispatch(message: IHostMethodMessage, socket: postMessageSockets.IPostMessageSocket): Promise<any> {
        let objectWrap = this._objectWrap[message.objectId];
        if (!objectWrap) {
            return Promise.reject({ message: "Object not found" });
        }
        else {
            return objectWrap.dispatch(message.methodName, message.args, socket);
        }
    }
}