import * as api from "@prague/routerlicious/dist/api-core";
import * as core from "@prague/routerlicious/dist/core";
import * as services from "@prague/routerlicious/dist/services";
import * as assert from "assert";
import * as fabric from "fabric-client";

function dumpBlock(block: fabric.Block) {
    console.log("BLOCK");
    console.log("----");
    console.log(JSON.stringify(block.header, null, 2));
    console.log("\n");
    console.log(`next hash ${block.header.previous_hash.toString()}`);
    console.log(`TRANSACTIONS ${block.data.data.length}`);
    console.log("--------------------------------------");
}

class MiniDeli {
    private sequenceNumbers = new Map<string, api.ISequencedDocumentMessage[]>();

    public sequence(message: core.IRawOperationMessage): api.ISequencedDocumentMessage {
        const documentId = message.documentId;
        if (!this.sequenceNumbers.has(documentId)) {
            this.sequenceNumbers.set(documentId, []);
        }

        const sequenceNumbers = this.sequenceNumbers.get(documentId);
        const sequenceNumber = sequenceNumbers.length + 1;

        const sequenced: api.ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.operation.clientSequenceNumber,
            contents: message.operation.contents,
            minimumSequenceNumber: 0,
            origin: null,
            referenceSequenceNumber: message.operation.referenceSequenceNumber,
            sequenceNumber,
            traces: [],
            type: message.operation.type,
            user: message.user,
        };
        sequenceNumbers.push(sequenced);

        return sequenced;
    }

    public async getDeltas(documentId: string, from: number, to: number): Promise<api.ISequencedDocumentMessage[]> {
        const deltas = this.sequenceNumbers.get(documentId);
        if (!deltas) {
            return Promise.reject("Unknown document ID");
        }

        from = from || 0;
        to = to || deltas.length;

        return deltas.slice(from, to);
    }

    public getOrCreateDocument(id: string) {
        if (!this.sequenceNumbers.has(id)) {
            this.sequenceNumbers.set(id, []);
            return false;
        } else {
            return true;
        }
    }

    public hasDocument(id: string) {
        return this.sequenceNumbers.has(id);
    }
}

export class ChainDb {
    private deli = new MiniDeli();
    private blocks = new Map<number, fabric.Block>();

    constructor(
        private client: fabric,
        private channel: fabric.Channel,
        private chainId: string,
        private publisher: services.SocketIoRedisPublisher) {
    }

    public async getDeltas(documentId: string, from: number, to: number): Promise<api.ISequencedDocumentMessage[]> {
        return this.deli.getDeltas(documentId, from, to);
    }

    public hasDocument(documentId): boolean {
        return this.deli.hasDocument(documentId);
    }

    public getOrCreateDocument(id: string) {
        return this.deli.getOrCreateDocument(id);
    }

    public async load() {
        const info = await this.channel.queryInfo();
        console.log("INFO");
        console.log("----");
        console.log(info.currentBlockHash.toString("hex"));
        console.log(info.previousBlockHash.toString("hex"));
        console.log(JSON.stringify(info));
        console.log("\n");

        // Iterate over the existing blocks and seed the message storage
        let hash = info.currentBlockHash.toString("hex");

        const blocks: fabric.Block[] = [];
        while (hash) {
            const block = await this.channel.queryBlockByHash(Buffer.from(hash, "hex"));
            blocks.push(block);
            dumpBlock(block);
            hash = block.header.previous_hash.toString();
        }
        blocks.reverse();

        for (const block of blocks) {
            this.sequenceBlock(block);
        }

        // Start listening for block updates
        // get an eventhub once the fabric client has a user assigned. The user
        // is required bacause the event registration must be signed
        const eventHub = this.client.newEventHub();
        eventHub.setPeerAddr("grpc://localhost:7053", null);
        eventHub.connect();
        eventHub.registerBlockEvent((block) => {
            this.processNewBlock(block);
        });
    }

    public async send(message: core.IRawOperationMessage) {
        // get a transaction id object based on the current user assigned to fabric client
        const txId = this.client.newTransactionID();
        console.log("Assigning transaction_id: ", txId.getTransactionID());

        // must send the proposal to endorsing peers
        const request = {
            args: [message.documentId, JSON.stringify({ type: "prague", data: message })],
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

    private async processNewBlock(block: fabric.Block): Promise<void> {
        const blockNumber = parseInt(block.header.number as any, 10);

        // Ignore previously processed blocks
        if (this.blocks.has(blockNumber)) {
            return;
        }

        if (blockNumber > 0 && !this.blocks.has(blockNumber - 1)) {
            const previousBlock = await this.channel.queryBlock(blockNumber - 1);
            await this.processNewBlock(previousBlock);
        }

        // recurse on ourself to handle possible case of block we started adding being added after the fact
        await this.processNewBlock(block);
    }

    private sequenceBlock(block: fabric.Block) {
        const blockNumber = parseInt(block.header.number as any, 10);
        const hash = block.header.data_hash.toString();
        const previousHash = block.header.previous_hash.toString();
        console.log(`Sequencing ${hash}:${previousHash}`);

        assert(!this.blocks.has(blockNumber), `!this.blocks.has(${blockNumber})`);
        assert(
            blockNumber === 0 || this.blocks.has(blockNumber - 1),
            `${blockNumber} === 0 || this.blocks.has(${blockNumber - 1})`);

        this.blocks.set(blockNumber, block);
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
            if (thing.payload.header.channel_header.type === 3) {
                try {
                    const inner = thing.payload.data;
                    // tslint:disable-next-line:max-line-length
                    const value = inner.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[0].rwset.writes[0].value;
                    console.log(value);
                    const parsed = JSON.parse(value);
                    if (parsed.type === "prague") {
                        const raw = parsed.data as core.IRawOperationMessage;
                        const sequenced = this.deli.sequence(parsed.data);
                        this.publisher
                            .to(`${raw.tenantId}/${raw.documentId}`)
                            .emit("op", raw.documentId, [sequenced]);
                    }
                } catch (exception) {
                    console.error(exception);
                }
            }
        }
    }
}

export async function init(
    client: fabric,
    channel: fabric.Channel,
    chainId: string,
    publisher: services.SocketIoRedisPublisher): Promise<ChainDb> {

    const db = new ChainDb(client, channel, chainId, publisher);
    await db.load();

    return db;
}
