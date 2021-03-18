declare module '@fluidframework/core-interfaces' {
  // tslint:disable-next-line: interface-name
  export interface IFluidObject extends Readonly<Partial<ProvideISyncBridgeConnector>> {}
}

export interface ProvideISyncBridgeConnector {
  readonly ISyncBridgeConnector: ISyncBridgeConnector;
}

export interface ISyncBridgeConnector extends ProvideISyncBridgeConnector {
  /**
   * Function to initialize connector by passing required context information
   * NOTE: Since connector is a DataObject which already has "initialized" method, had to name it as "init" for now
   */
  init(context: SyncBridgeConnectorContext): void;
}

declare module '@fluidframework/core-interfaces' {
  // tslint:disable-next-line: interface-name
  export interface IFluidObject extends Readonly<Partial<ProvideISyncBridgeClientProvider>> {}
}

export interface ProvideISyncBridgeClientProvider {
  readonly ISyncBridgeClientProvider: ISyncBridgeClientProvider;
}

export interface ISyncBridgeClientProvider extends ProvideISyncBridgeClientProvider {
  getSyncBridgeClient(): Promise<ISyncBridgeClient>;
}

declare module '@fluidframework/core-interfaces' {
  // tslint:disable-next-line: interface-name
  export interface IFluidObject extends Readonly<Partial<ProvideISyncMessageHandler>> {}
}

export interface ProvideISyncMessageHandler {
  readonly ISyncMessageHandler: ISyncMessageHandler;
}

export interface ISyncMessageHandler extends ProvideISyncMessageHandler {
  handleSyncMessage(syncMessage: SyncMessage): Promise<SyncMessageHandlerResult | undefined>;
}

declare module '@fluidframework/core-interfaces' {
  // tslint:disable-next-line: interface-name
  export interface IFluidObject extends Readonly<Partial<ProvideISyncBridgeClient>> {}
}

export interface ProvideISyncBridgeClient {
  readonly ISyncBridgeClient: ISyncBridgeClient;
}

export interface ISyncBridgeClient extends ProvideISyncBridgeClient {
  submit(message: SyncMessage): void;
  registerSyncMessageHandler(handler: ISyncMessageHandler): void;

  // TODO: Revisit for name improvement.
  getFirstFailedMessage(): Promise<SyncMessage | undefined>;
  removeFirstFailedMessage(): Promise<void>;
}

declare module '@fluidframework/core-interfaces' {
  // tslint:disable-next-line: interface-name
  export interface IFluidObject extends Readonly<Partial<ProvideIProduceLeaderSelection>> {}
}

export interface ProvideIProduceLeaderSelection {
  readonly IProduceLeaderSelection: IProduceLeaderSelection;
}

export interface IProduceLeaderSelection extends ProvideIProduceLeaderSelection {
  onLeaderSelected(callback: any): Promise<void>;
  onLeaderLost(callback: any): Promise<void>;
  enableLeaderSelection(handler?: any): Promise<void>;
}

//TODO: TBD
export interface SyncBridgeClientConfig {}

export interface SyncBridgeConnectorContext {
  client: ISyncBridgeClient;
}

export interface SyncMessage {
  opCode: string;
  type: SyncMessageType;
  payload?: SyncPayload;
}

export interface SyncPayload {
  data?: any;
  error?: any;
}

export interface SyncMessageHandlerResult {
  success: boolean;
  data?: any;
  error?: any;
}

export enum SyncMessageType {
  SyncOperation = 'SyncOperation',
  ControlMessage = 'ControlMessage'
}

export enum SyncBridgeOpCodes {
  PROCESSING_ERROR = 'PROCESSING_ERROR',
}

