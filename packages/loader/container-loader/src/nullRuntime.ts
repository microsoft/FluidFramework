import {
    ConnectionState,
    IChaincodeFactory,
    IContainerContext,
    IRequest,
    IResponse,
    IRuntime,
    ISequencedDocumentMessage,
    ISummaryTree,
    ITree,
    SummaryType,
} from "@prague/container-definitions";

class NullRuntime implements IRuntime {
    public ready: Promise<void> | undefined;

    public snapshot(tagMessage: string): Promise<ITree | null> {
        return Promise.resolve(null);
    }

    public summarize(): Promise<ISummaryTree> {
        return Promise.resolve({
            tree: {},
            type: SummaryType.Tree,
        });
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        return;
    }

    public stop(): Promise<void> {
        return Promise.resolve();
    }

    public request(request: IRequest): Promise<IResponse> {
        return Promise.resolve({ status: 404, mimeType: "text/plain", value: null });
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return Promise.reject("Null runtime should not receive messages");
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        throw new Error("Null runtime should not receive messages");
    }

    public postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        return Promise.reject("Null runtime should not receive messages");
    }

    public processSignal(message: any, local: boolean) {
        // Null runtime can receive signals but it's okay to miss those.
        return;
    }
}

export class NullChaincode implements IChaincodeFactory {
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return new NullRuntime();
    }
}
