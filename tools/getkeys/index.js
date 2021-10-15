/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

msRestAzure = require('ms-rest-azure');
keyVault = require('azure-keyvault');
rcTools = require('@fluidframework/tool-utils');
const { exec } = require('child_process');

async function getKeys(keyVaultClient, rc, vaultUri) {
    const secretList = await keyVaultClient.getSecrets(vaultUri);
    const p = [];
    for (const secret of secretList) {
        if (secret.attributes.enabled) {
            const secretName = secret.id.split('/').pop();
            // exclude secrets with automation prefix, which should only be used in automation
            if (!secretName.startsWith("automation")) {
                p.push((async () => {
                    const response = await keyVaultClient.getSecret(vaultUri, secretName, '');
                    const envName = secretName.split('-').join('__'); // secret name can't contain underscores
                    console.log(`Setting environment variable ${envName}...`);
                    await setEnv(envName, response.value);
                    rc.secrets[envName] = response.value;
                })());;
            }
        }
    }

    return Promise.all(p);
}

function setEnv(name, value) {
    return new Promise((res, rej) => {
        const callback = (err, stdout, stderr) => {
            if (err) {
                rej(err);
            }
            if (stderr) {
                console.log(stderr + stdout);
            }
            res();
        }
        const shell = process.env.SHELL ? process.env.SHELL.split('/').pop() : null;
        const termProgram = process.env.TERM_PROGRAM;
        const setString = `export ${name}="${value}"`;
        switch (shell) {
            case "bash":
                const destFile = termProgram === "Apple_Terminal" ? "~/.bash_profile" : "~/.bashrc";
                exec(`${setString} && echo '${setString}' >> ${destFile}`, callback);
            case "zsh":
                exec(`${setString} && echo '${setString}' >> ~/.zshrc`, callback);
            case "fish":
                exec(`set -xU '${name}' '${value}'`, { "shell": process.env.SHELL }, callback);
            default: // windows
                const escapedValue = value.split('"').join('\\"');
                exec(`setx ${name} "${escapedValue}"`, callback);
        }
    });
}

(async () => {
    const credentialsP = msRestAzure.interactiveLogin();
    const rcP = rcTools.loadRC();
    const [credentials, rc] = await Promise.all([credentialsP, rcP]);
    const client = new keyVault.KeyVaultClient(credentials);
    if (rc.secrets === undefined) {
        rc.secrets = {};
    }
    console.log("Getting secrets...");

    // Primary key vault for test/dev secrets shared by Microsoft-internal teams working on FF
    await getKeys(client, rc, "https://prague-key-vault.vault.azure.net/");

    try {
        // Key Vault with restricted access for the FF dev team only
        await getKeys(client, rc, "https://ff-internal-dev-secrets.vault.azure.net/");
        console.log("Overrode defaults with values from the FF internal keyvault.");
    } catch (e) { }
    await rcTools.saveRC(rc);
})().catch(e => {
    console.error(`FATAL ERROR: ${e.stack}`);
    process.exit(-1);
});
