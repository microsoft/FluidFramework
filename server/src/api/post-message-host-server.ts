import * as postMessageSockets from '../post-message-sockets/index';
import { Promise } from 'es6-promise';
import { ITable, ITableService } from './interfaces';
import * as _ from 'lodash';
import {
    IHostMethodResult,
    IWrappedService,
    IHostMethodValueResult,
    IHostMethodObjectResult,
    MethodResultType,
    IHostMessage,
    MessageType,
    IHostMethodMessage
} from './messages';

/**
 * This can be the actual interface that will be provided to the serverf
 */
class TableService implements ITableService {
    createTable(): Promise<ITable> {
        return Promise.reject("not implemented");
    }
}

class ServiceWrapper {
    private static _nextObjectId = 0;

    public id: number;

    public methods: string[] = [];

    constructor(private _host: PostMessageHostServer, private _service: any) {
        this.id = ServiceWrapper.GetNextObjectId();

        let test = _.forIn(_service, (value, key) => {
            if (_.isFunction(value)) {
                this.methods.push(key);
            }
        });
    }

    private static GetNextObjectId() {
        return ServiceWrapper._nextObjectId++;
    }

    dispatch(methodName: string, args: any[]): Promise<IHostMethodResult> {
        if (!_.isFunction(this._service[methodName])) {
            return Promise.reject({ message: `${methodName} is not a function` });
        }

        let method = this._service[methodName] as Function;
        let resultP = method.apply(this._service, args) as Promise<any>;

        return resultP.then((result) => {
            if (_.isObject(result) && !_.isArray(result)) {
                // TODO if we recieve the same object consider looking it back up
                let wrappedObject = this._host.wrapService(result);
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
                    value: result
                };
            }
        });
    }
}

export class PostMessageHostServer {
    private _host: postMessageSockets.IPostMessageHost;

    private _services: { [name: string]: IWrappedService } = {};

    private _objectWrap: { [key: number]: ServiceWrapper } = {};

    constructor(private _window: Window) {
    }

    wrapService(service: any): ServiceWrapper {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectWrap = new ServiceWrapper(this, service);
        this._objectWrap[objectWrap.id] = objectWrap;

        return objectWrap;
    }

    addService(name: string, service: any) {
        // We create an object wrapper for the service to marshal calls and responses over the postMessage channel
        let objectWrap = this.wrapService(service);
        this._services[name] = { objectId: objectWrap.id, methods: objectWrap.methods };
    }

    start() {
        this._host = postMessageSockets.getOrCreateHost(this._window);
        this._host.listen((connection) => {
            console.log('Received a new connection');

            connection.addEventListener((message: IHostMessage) => {
                if (message.type === MessageType.Init) {
                    return Promise.resolve({ services: this._services });
                }
                else {
                    let hostMethodMessage = message as IHostMethodMessage;
                    let objectWrap = this._objectWrap[hostMethodMessage.objectId];
                    if (!objectWrap) {
                        return Promise.reject({ message: "Object not found" });
                    }
                    else {
                        return objectWrap.dispatch(hostMethodMessage.methodName, hostMethodMessage.args);
                    }
                }
            })
        });
    }
}