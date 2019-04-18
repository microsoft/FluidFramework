/*
 * Port of fabcar example from HyperLedger source code
 * https://github.com/hyperledger/fabric-samples/tree/release-1.1/fabcar
 */

import * as commander from "commander";
import * as caClient from "fabric-ca-client";
import * as fabric from "fabric-client";
import * as path from "path";

async function run(userId: string) {
    const client = new fabric();
    const storePath = path.join(__dirname, "../hfc-key-store");
    console.log(`Store path: ${storePath}`);

    const stateStore = await fabric.newDefaultKeyValueStore({ path: storePath });
    // assign the store to the fabric client
    client.setStateStore(stateStore);
    const cryptoSuite = fabric.newCryptoSuite();

    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    const cryptoStore = fabric.newCryptoKeyStore({ path: storePath });
    cryptoSuite.setCryptoKeyStore(cryptoStore);
    client.setCryptoSuite(cryptoSuite);

    // be sure to change the http to https when the CA is running TLS enabled
    const fabricCaClient = new caClient("http://localhost:7054", null, "", cryptoSuite);

    // first check to see if the admin is already enrolled
    const adminUser = await client.getUserContext("admin", true);

    if (!adminUser || !adminUser.isEnrolled()) {
        return Promise.reject("Failed to get admin.... run enrollAdmin.js");
    }

    console.log("Successfully loaded admin from persistence");

    // at this point we should have the admin user
    // first need to register the user with the CA server
    const secret = await fabricCaClient.register(
        { enrollmentID: userId, affiliation: "org1.department1", role: "client" },
        adminUser);

    // next we need to enroll the user with CA server
    console.log(`Successfully registered user1 - secret: ${secret}`);

    const enrollment = await fabricCaClient.enroll({ enrollmentID: userId, enrollmentSecret: secret });
    console.log(`Successfully enrolled member user "${userId}"`);
    const memberUser = await client.createUser(
        {
            cryptoContent: {
                privateKeyPEM: enrollment.key.toBytes(),
                signedCertPEM: enrollment.certificate,
            },
            mspid: "Org1MSP",
            skipPersistence: false,
            username: userId,
        });

    await client.setUserContext(memberUser);
    console.log(`${userId} was successfully registered and enrolled and is ready to intreact with the fabric network`);
}

commander
    .version("0.0.1")
    .arguments("<userId>")
    .action((userId: string) => {
        run(userId).then(
            () => {
                console.log("DONE!");
            },
            (error) => {
                console.error("Failed to register", error);
                if (error.toString().indexOf("Authorization") > -1) {
                    console.error(
                        "Authorization failures may be caused by having admin credentials from a " +
                        "previous CA instance.\n" +
                        "Try again after deleting the contents of the store directory");
                }

                process.exit(1);
            });
    })
    .parse(process.argv);
