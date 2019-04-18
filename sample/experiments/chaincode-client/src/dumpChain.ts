/*
 * Port of fabcar example from HyperLedger source code
 * https://github.com/hyperledger/fabric-samples/tree/release-1.1/fabcar
 */

import * as commander from "commander";
import * as fabric from "fabric-client";
import * as path from "path";

async function run(userId: string, channelId: string): Promise<any> {
    const client = new fabric();

    // setup the fabric network
    const channel = client.newChannel(channelId);
    const peer = client.newPeer("grpc://localhost:7051");
    channel.addPeer(peer);
    const order = client.newOrderer("grpc://localhost:7050");
    channel.addOrderer(order);

    const storePath = path.join(__dirname, "../hfc-key-store");
    const stateStore = await fabric.newDefaultKeyValueStore({ path: storePath });

    // assign the store to the fabric client
    client.setStateStore(stateStore);
    const cryptoSuite = fabric.newCryptoSuite();
    const cryptoStore = fabric.newCryptoKeyStore({ path: storePath });
    cryptoSuite.setCryptoKeyStore(cryptoStore);
    client.setCryptoSuite(cryptoSuite);

    const memberUser = await client.getUserContext(userId, true);
    if (!memberUser || !memberUser.isEnrolled()) {
        return Promise.reject(`Failed to get ${userId}.... run registerUser.js`);
    }

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

    await foo(client);
}

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

async function foo(client: fabric): Promise<void> {
    // get an eventhub once the fabric client has a user assigned. The user
    // is required bacause the event registration must be signed
    const eventHub = client.newEventHub();
    eventHub.setPeerAddr("grpc://localhost:7053", null);
    eventHub.connect();
    eventHub.registerBlockEvent((block) => {
        dumpBlock(block);
    });

    return new Promise<void>((reject, response) => { return; });
}

commander
    .version("0.0.1")
    .option("-u, --userId [userId]", "User ID", "user1")
    .option("-c, --channelId [channelId]", "Channel ID", "mychannel")
    .parse(process.argv);

run(commander.userId, commander.channelId).then(
    (value) => {
        console.log("Done");
    },
    (error) => {
        console.error("Failed to run query", error);
        process.exit(1);
    });
