/*
 * Port of fabcar example from HyperLedger source code
 * https://github.com/hyperledger/fabric-samples/tree/release-1.1/fabcar
 */

import * as caClient from "fabric-ca-client";
import * as fabric from "fabric-client";
import * as path from "path";

async function run() {
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

    // first check to see if the admin is already enrolled
    let adminUser = null;
    const userFromStore = await client.getUserContext("admin", true);
    if (userFromStore && userFromStore.isEnrolled()) {
        console.log("Successfully loaded admin from persistence");
        adminUser = userFromStore;
    } else {
        const tlsOptions = {
            trustedRoots: [] as any,    // type definitions want this as a buffer which appears to be wrwong
            verify: false,
        };

        // be sure to change the http to https when the CA is running TLS enabled
        const fabricCaClient = new caClient("http://localhost:7054", tlsOptions, "ca.example.com", cryptoSuite);

        // need to enroll it with CA server
        const enrollment = await fabricCaClient.enroll({
            enrollmentID: "admin",
            enrollmentSecret: "adminpw",
        });

        console.log('Successfully enrolled admin user "admin"');
        const user = await client.createUser(
            {
                cryptoContent: {
                    privateKeyPEM: enrollment.key.toBytes(),
                    signedCertPEM: enrollment.certificate,
                },
                mspid: "Org1MSP",
                skipPersistence: false,
                username: "admin",
            });

        adminUser = user;
        return client.setUserContext(adminUser);
    }

    console.log(`Assigned the admin user to the fabric client :: ${adminUser.toString()}`);
}

run().then(
    () => {
        console.log("DONE!");
    },
    (error) => {
        console.error("error", error);
        process.exit(1);
    });
