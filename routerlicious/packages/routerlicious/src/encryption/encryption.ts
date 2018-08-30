/**
 * General utilities for supporting encryption on delta ops. NOTE: Wrap in interface/class?
 */
import * as cryptojs from "crypto-js";
import * as openpgp from "openpgp";

export interface IAsymmetricKeys {
    privateKey: string;
    publicKey: string;
}

export interface IAESKeyPackage {
    aesSalt: string;
    aesIV: string;
    aesKey: string;
}

export async function generateAsymmetricKeys(numBitsForKey = 4096,
                                             secretPassphrase = "spooky",
                                             hashId = ""): Promise<IAsymmetricKeys> {
    // Generate and set public/private keys for encryption.
    const keyGenerationOptions = {
        /**
         * NOTE: potentially hash on clientId + some "sessionIdentifier" for later efforts at encrypting editing
         * sessions to specific groups (i.e. so that a third person cannot see the deltas of a session without
         * being given explicit access to session)?
         */
        numBits: numBitsForKey, // RSA key size
        passphrase: secretPassphrase,
        userIds: [{ name: hashId }], // Hash on clientId
    };

    return openpgp.generateKey(keyGenerationOptions).then((key) => {
        const privateKey: string = key.privateKeyArmored;
        const publicKey: string = key.publicKeyArmored;

        return{privateKey, publicKey};
    });
}

export function generateAESKey(numBits = 256, secretPassphrase = "spooky", numIters = 100): IAESKeyPackage {
    // Generate/derive AES key.
    const aesSalt = cryptojs.lib.WordArray.random(128 / 8);
    const aesIV = cryptojs.lib.WordArray.random(128 / 8);
    const aesKey = cryptojs.PBKDF2(this.secretPassphrase, aesSalt,
                                    {keySize: numBits / 32, iterations: numIters});

    return {aesSalt, aesIV, aesKey};
}
