export enum MessageType {
    // Initialization message to the host
    Init,

    // Method invocation on the host
    Method,
}

export interface IWrappedService {
    objectId: number;

    methods: string[];
}

export interface IInitResult {
    services: { [name: string]: IWrappedService };
}

export interface IHostMessage {
    type: MessageType;
}

export enum MethodResultType {
    Value,
    Object
}

export interface IHostMethodResult {
    type: MethodResultType;
}

export interface IHostMethodObjectResult extends IHostMethodResult {
    value: IWrappedService;
}

export interface IHostMethodValueResult extends IHostMethodResult {
    value: any;
}

export interface IHostMethodMessage extends IHostMessage {
    // Target object identifier
    objectId: number;

    // method name to invoke
    methodName: string;

    // arguments to pass to the method
    args: IHostMethodResult[];
}
