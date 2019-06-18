/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Port of fabcar example from HyperLedger source code
 * https://github.com/hyperledger/fabric-samples/tree/release-1.1/fabcar
 */

import * as commander from "commander";
import * as fabric from "fabric-client";
import * as path from "path";

async function run(userId: string, channelId: string, key: string): Promise<string> {
    const client = new fabric();

    // setup the fabric network
    const channel = client.newChannel(channelId);
    const peer = client.newPeer("grpc://localhost:7051");
    channel.addPeer(peer);

    const storePath = path.join(__dirname, "../hfc-key-store");
    const stateStore = await fabric.newDefaultKeyValueStore({ path: storePath });

    // assign the store to the fabric client
    client.setStateStore(stateStore);
    const cryptoSuite = fabric.newCryptoSuite();
    const cryptoStore = fabric.newCryptoKeyStore({ path: storePath });
    cryptoSuite.setCryptoKeyStore(cryptoStore);
    client.setCryptoSuite(cryptoSuite);

    // get the enrolled user from persistence, this user will sign all requests.
    // The get call also seems to apply this user to the context
    const memberUser = await client.getUserContext(userId, true);
    if (!memberUser || !memberUser.isEnrolled()) {
        return Promise.reject(`Failed to get ${userId}.... run registerUser.js`);
    }

    const request = {
        args: [key],
        // targets : --- letting this default to the peers assigned to the channel
        chaincodeId: "fabcar",
        fcn: "get2",
    };

    // send the query proposal to the peer
    const queryResponses = await channel.queryByChaincode(request);

    console.log("Query has completed, checking results");

    if (!queryResponses || queryResponses.length !== 1) {
        return Promise.reject("No payloads were returned from query");
    } else if (queryResponses[0] instanceof Error) {
        return Promise.reject(`error from query = ${queryResponses[0]}`);
    }

    return queryResponses[0].toString();
}

commander
    .version("0.0.1")
    .option("-u, --userId [userId]", "User ID", "user1")
    .option("-c, --channelId [channelId]", "Channel ID", "mychannel")
    .arguments("<key>")
    .action((key) => {
        console.log(`${commander.userId} ${commander.channelId}`);
        run(commander.userId, commander.channelId, key).then(
            (response) => {
                console.log("Response is ", response);
            },
            (error) => {
                console.error("Failed to run query", error);
                process.exit(1);
            });
    })
    .parse(process.argv);
