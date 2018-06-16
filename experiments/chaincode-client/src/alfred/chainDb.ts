import * as core from "@prague/routerlicious/dist/core";
import * as fabric from "fabric-client";

function dumpBlock(block: fabric.Block) {
    console.log("BLOCK");
    console.log("----");
    console.log(JSON.stringify(block.header, null, 2));
    console.log("\n");
    console.log(`next hash ${block.header.previous_hash.toString()}`);
    console.log(`TRANSACTIONS ${block.data.data.length}`);
    console.log("--------------------------------------");
    for (const thing of block.data.data) {
        // enum HeaderType {
        //     MESSAGE = 0;                   // Used for messages which are signed but opaque
        //     CONFIG = 1;                    // Used for messages which express the channel config
        //     CONFIG_UPDATE = 2;             // Used for transactions which update the channel config
        //     ENDORSER_TRANSACTION = 3;      // Used by the SDK to submit endorser based transactions
        //     ORDERER_TRANSACTION = 4;       // Used internally by the orderer for management
        //     DELIVER_SEEK_INFO = 5;         // Used as the type for Envelope messages submitted to instruct
        //                                    // the Deliver API to seek
        //     CHAINCODE_PACKAGE = 6;         // Used for packaging chaincode artifacts for install
        //     PEER_RESOURCE_UPDATE = 7;      // Used for encoding updates to the peer resource configuration
        // }
        const txDetails = {
            txId: thing.payload.header.channel_header.tx_id,
            type: thing.payload.header.channel_header.type,
        };
        console.log(txDetails);
    }
}

export class ChainDb {
    constructor(private client: fabric, private channel: fabric.Channel, private chainId: string) {
    }

    public async send(message: core.IRawOperationMessage) {
        // get a transaction id object based on the current user assigned to fabric client
        const txId = this.client.newTransactionID();
        console.log("Assigning transaction_id: ", txId.getTransactionID());

        // must send the proposal to endorsing peers
        const request = {
            args: [message.documentId, JSON.stringify(message)],
            // targets: let default to the peer assigned to the client
            chainId: this.chainId,
            chaincodeId: "fabcar",
            fcn: "op",
            txId,
        };

        // send the transaction proposal to the peers
        const [proposalResponses] = await this.channel.sendTransactionProposal(request);
        if (!proposalResponses || !proposalResponses[0].response || proposalResponses[0].response.status !== 200) {
            return Promise.reject("Transaction proposal was bad");
        }
    }
}

export async function init(client: fabric, channel: fabric.Channel, chainId: string): Promise<ChainDb> {
    const info = await channel.queryInfo();
    console.log("INFO");
    console.log("----");
    console.log(info.currentBlockHash.toString("hex"));
    console.log(info.previousBlockHash.toString("hex"));
    console.log(JSON.stringify(info));
    console.log("\n");

    // Iterate over the blocks
    let hash = info.currentBlockHash.toString("hex");
    while (hash) {
        const block = await channel.queryBlockByHash(Buffer.from(hash, "hex"));
        dumpBlock(block);
        hash = block.header.previous_hash.toString();
    }

    // get an eventhub once the fabric client has a user assigned. The user
    // is required bacause the event registration must be signed
    const eventHub = client.newEventHub();
    eventHub.setPeerAddr("grpc://localhost:7053", null);
    eventHub.connect();
    eventHub.registerBlockEvent((block) => {
        dumpBlock(block);
    });

    return new ChainDb(client, channel, chainId);
}
