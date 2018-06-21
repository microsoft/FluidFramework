import { ChaincodeReponse, error as shimError, Iterators, Stub, success } from "fabric-shim";

export interface IChaincode {
    Init(stub): Promise<ChaincodeReponse>;
    Invoke(stub): Promise<ChaincodeReponse>;
}

async function getAllResults(iterator: Iterators.StateQueryIterator, getKeys: boolean) {
    const allResults: string[] = [];

    while (true) {
        const res = await iterator.next();
        const resAsAny = res as any;

        if (resAsAny.value.namespace) {
            console.log(resAsAny.value.namespace);
        }
        if (resAsAny.value.key) {
            console.log(resAsAny.value.key);
        }
        if (resAsAny.value.tx_id) {
            console.log(resAsAny.value.tx_id);
        }
        if (resAsAny.value.channel_id) {
            console.log(resAsAny.value.channel_id);
        }
        if (resAsAny.value.timestamp) {
            console.log(resAsAny.value.timestamp);
        }
        if (resAsAny.value.is_delete) {
            console.log(resAsAny.value.is_delete);
        }

        const theVal = (getKeys) ? res.value.key : res.value.value.toString("utf8");
        allResults.push(theVal);
        console.log(theVal);

        if (res.done) {
            console.log("end of data");
            await iterator.close();
            break;
        }
    }
    console.log(`All results is ${JSON.stringify(allResults)}`);

    return allResults;
}

export class Contract implements IChaincode {
    public async Init(stub: Stub): Promise<ChaincodeReponse> {
        console.log("Hey! Someone asked me to Init!");

        const args = stub.getStringArgs();
        if (args.length !== 2) {
            return shimError("Incorrect arguments. Expecting a key and a value");
        }

        const [key, value] = args;
        console.log(`Key-Value: ${key} ${value}`);
        await stub.putState(key, Buffer.from(value));

        return success();
    }

    public async Invoke(stub: Stub): Promise<ChaincodeReponse> {
        console.log("Hey! I'm being invoked!");
        const { fcn, params } = stub.getFunctionAndParameters();
        console.log(`${fcn} ${JSON.stringify(params)}`);

        let result: Buffer;
        switch (fcn) {
            case "get2":
                result = await this.getKey(stub, params);
                break;
            case "set":
                result = await this.setKey(stub, params);
                break;
            case "op":
                result = await this.op(stub, params);
                break;
            default:
                console.log("I hit a default block");
                return shimError("Unknown function call");
        }

        return success(result);
    }

    private async op(stub: Stub, params: string[]): Promise<Buffer> {
        if (params.length !== 2) {
            return Promise.reject("Invalid argument length to get");
        }

        const [documentId, op] = params;
        const txId = stub.getTxID();
        const compositeIndexName = "documentId~txID";
        const key = stub.createCompositeKey(compositeIndexName, [documentId, txId]);
        console.log(`Comp key is ${key.toString()}`);
        await stub.putState(key, Buffer.from(op));

        return Buffer.from("");
    }

    private async getKey(stub: Stub, params: string[]): Promise<Buffer> {
        if (params.length !== 1) {
            return Promise.reject("Invalid argument length to get");
        }

        // let result = "";
        const iterator = await stub.getStateByPartialCompositeKey("documentId~txID", [params[0]]);

        const results = await getAllResults(iterator, false);
        // while (true) {
        //     const nextResult = await iterator.next();
        //     console.log(`Iterator ${nextResult.done}`);
        //     if (!nextResult.done) {
        //         break;
        //     }

        //     console.log(`${nextResult.value.key}:${nextResult.value.value.toString()}`);
        //     result += `${nextResult.value.value.toString()}\n`;
        // }

        return Buffer.from(JSON.stringify(results));
    }

    private async setKey(stub: Stub, params: string[]): Promise<Buffer> {
        console.log("I'm in setKey");
        if (params.length !== 2) {
            return Promise.reject("Invalid argument length to put");
        }

        const valueAsBuffer = Buffer.from(params[1]);
        console.log("Doing a putState");
        return stub.putState(params[0], valueAsBuffer).then(
            () => {
                console.log("That worked!");
                return valueAsBuffer;
            },
            (error) => {
                console.log(error);
                return Promise.reject(error);
            });
    }
}
