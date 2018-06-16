/*
 * Port of fabcar example from HyperLedger source code
 * https://github.com/hyperledger/fabric-samples/tree/release-1.1/fabcar
 */

import * as commander from "commander";
import * as fabric from "fabric-client";
import * as path from "path";
import * as util from "util";

async function run(userId: string, channelId: string, documentId: string, op: string): Promise<string> {
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

    const sendPs = [];
    for (let i = 0; i < 15; i++) {
        const sendP = submitTx(client, channel, channelId, documentId, op);
        sendPs.push(sendP);
    }
    await Promise.all(sendPs);
}

async function submitTx(client: fabric, channel: fabric.Channel, channelId: string, documentId: string, op: string) {
    // get a transaction id object based on the current user assigned to fabric client
    const txId = client.newTransactionID();
    console.log("Assigning transaction_id: ", txId.getTransactionID());

    // must send the proposal to endorsing peers
    const request = {
        args: [documentId, op],
        // targets: let default to the peer assigned to the client
        chainId: channelId,
        chaincodeId: "fabcar",
        fcn: "op",
        txId,
    };

    // send the transaction proposal to the peers
    const [proposalResponses, proposal] = await channel.sendTransactionProposal(request);
    if (!proposalResponses || !proposalResponses[0].response || proposalResponses[0].response.status !== 200) {
        return Promise.reject("Transaction proposal was bad");
    }

    console.log(util.format(
        'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
        proposalResponses[0].response.status, proposalResponses[0].response.message));

    // build up the request for the orderer to have the transaction committed
    const commitRequest: fabric.TransactionRequest = {
        proposal,
        proposalResponses,
    };

    // set the transaction listener and set a timeout of 30 sec
    // if the transaction did not get committed within the timeout period,
    // report a TIMEOUT status
    const transactionIdAsString = txId.getTransactionID();
    console.log(`txid: ${transactionIdAsString}`);

    const sendP = channel.sendTransaction(commitRequest);

    // using resolve the promise so that result status may be processed
    // under the then clause rather than having the catch clause process
    // the status
    const txP = new Promise<any>((resolve, reject) => {
        // get an eventhub once the fabric client has a user assigned. The user
        // is required bacause the event registration must be signed
        const eventHub = client.newEventHub();
        eventHub.setPeerAddr("grpc://localhost:7053", null);

        const handle = setTimeout(
            () => {
                eventHub.disconnect();
                reject(new Error("Trnasaction did not complete within 30 seconds"));
            },
            3000);

        eventHub.connect();
        eventHub.registerTxEvent(
            transactionIdAsString,
            (tx, code) => {
                // this is the callback for transaction event status
                // first some clean up of event listener
                clearTimeout(handle);
                eventHub.unregisterTxEvent(transactionIdAsString);
                eventHub.disconnect();

                // now let the application know what happened
                const returnStatus = { eventStatus: code, txId: transactionIdAsString };
                if (code !== "VALID") {
                    reject(new Error(`Problem with the tranaction, event status :: ${code}`));
                } else {
                    console.log("The transaction has been committed on peer " + eventHub.getPeerAddr());
                    resolve(returnStatus);
                }
            },
            (err) => {
                clearTimeout(handle);
                // this is the callback if something goes wrong with the event registration or processing
                reject(new Error(`There was a problem with the eventhub :: ${err}`));
            });
    });

    const [send] = await Promise.all([sendP, txP]);

    console.log("Send transaction promise and event listener promise have completed");
    // check the results in the order the promises were added to the promise all list
    if (send.status === "SUCCESS") {
        console.log("Successfully sent transaction to the orderer.");
    } else {
        return Promise.reject("Failed to order the transaction. Error code: " + send.status);
    }

    console.log("Successfully committed the change to the ledger by the peer");
}

commander
    .version("0.0.1")
    .option("-u, --userId [userId]", "User ID", "user1")
    .option("-c, --channelId [channelId]", "Channel ID", "mychannel")
    .arguments("<documentId> <op>")
    .action((documentId, op) => {
        run(commander.userId, commander.channelId, documentId, op).then(
            () => {
                console.log("Done");
            },
            (error) => {
                console.error("Failed to run query", error);
                process.exit(1);
            });
    })
    .parse(process.argv);
