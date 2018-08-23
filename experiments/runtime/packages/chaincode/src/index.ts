import { Document } from "@prague/api";
import { IChaincode, IRuntime } from "@prague/runtime-definitions";

class Chaincode implements IChaincode {
    constructor(document: Document) {
        // empty
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}

export async function instantiate(runtime: IRuntime): Promise<IChaincode> {
    // Let's get messages flowing into the document. Should it register op handlers on the runtime? And then
    // be able to query the runtime for the current snapshot state and resource access?

    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const document = await Document.Load(runtime);

    return new Chaincode(document);
}
