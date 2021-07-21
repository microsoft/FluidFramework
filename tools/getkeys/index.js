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
    for (const secret of secretList) {
        if (secret.attributes.enabled) {
            const secretName = secret.id.split('/').pop();
            // exclude secrets with automation prefix, which should only be used in automation
            if(!secretName.startsWith("automation")){
                keyVaultClient.getSecret(vaultUri, secretName, '').then((response) => {
                    const envName = secretName.split('-').join('__'); // secret name can't contain underscores
                    console.log(`Setting environment variable ${envName}...`);
                    setEnv(envName, response.value);
                    rc.secrets[envName] = response.value;
                });
            }
        }
    }
}

function setEnv(name, value) {
    const shell = process.env.SHELL ? process.env.SHELL.split('/').pop() : null;
    const termProgram = process.env.TERM_PROGRAM;
    const setString = `export ${name}="${value}"`;
    switch (shell) {
        case "bash":
            const destFile = termProgram === "Apple_Terminal" ? "~/.bash_profile" : "~/.bashrc";
            return exec(`${setString} && echo '${setString}' >> ${destFile}`, stdResponse);
        case "zsh":
            return exec(`${setString} && echo '${setString}' >> ~/.zshrc`, stdResponse);
        case "fish":
            return exec(`set -xU '${name}' '${value}'`, {"shell": process.env.SHELL}, stdResponse);
        default: // windows
            const escapedValue = value.split('"').join('\\"');
            return exec(`setx ${name} "${escapedValue}"`, stdResponse);
    }
}

function stdResponse(err, stdout, stderr) {
    console.log(err ? err : (stderr || stdout) ? stderr + stdout : "done");
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
    } catch (e) {
        console.log("Couldn't get secrets from FF internal keyvault. If you need access make sure you are in the relevant security group.")
    }
    await rcTools.saveRC(rc);
})();
