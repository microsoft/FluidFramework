/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

msRestAzure = require('ms-rest-azure');
keyVault = require('azure-keyvault');
rcTools = require('@fluidframework/tool-utils');
const { exec } = require('child_process');

async function getKeys(keyVaultClient, rc, vaultName) {
    console.log(`Getting secrets from ${vaultName}...`);
    const secretList = await keyVaultClient.getSecrets(vaultName);
    const p = [];
    for (const secret of secretList) {
        if (secret.attributes.enabled) {
            const secretName = secret.id.split('/').pop();
            // exclude secrets with automation prefix, which should only be used in automation
            if (!secretName.startsWith("automation")) {
                p.push((async () => {
                    const response = await keyVaultClient.getSecret(vaultName, secretName);
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

async function execAsync(command) {
    return new Promise((res, rej) => {
        exec(command,  (err, stdout, stderr) => {
            if (err) {
                rej(err);
            }
            if (stderr) {
                console.log(stderr + stdout);
            }
            res(stdout);
        });
    });
}

async function setEnv(name, value) {
    const shell = process.env.SHELL ? process.env.SHELL.split('/').pop() : null;
    const termProgram = process.env.TERM_PROGRAM;
    const setString = `export ${name}="${value}"`;
    switch (shell) {
        case "bash":
            const destFile = termProgram === "Apple_Terminal" ? "~/.bash_profile" : "~/.bashrc";
            return execAsync(`${setString} && echo '${setString}' >> ${destFile}`);
        case "zsh":
            return execAsync(`${setString} && echo '${setString}' >> ~/.zshrc`);
        case "fish":
            return execAsync(`set -xU '${name}' '${value}'`, { "shell": process.env.SHELL });
        default: // windows
            const escapedValue = value.split('"').join('\\"');
            return execAsync(`setx ${name} "${escapedValue}"`);
    }
}

class AzCliKeyVaultClient {
    static async get() {
        try {
            await execAsync("az account set --subscription Fluid");
            return new AzCliKeyVaultClient();
        } catch (e) {
            return undefined;
        }
    }

    async getSecrets(vaultName) {
        return JSON.parse(await execAsync(`az keyvault secret list --vault-name ${vaultName}`));
    }

    async getSecret(vaultName, secretName) {
        return JSON.parse(await execAsync(`az keyvault secret show --vault-name ${vaultName} --name ${secretName}`));
    }
};

class MsRestAzureKeyVaultClinet {
    static async get() {
        const credentials = await msRestAzure.interactiveLogin();
        return new MsRestAzureKeyVaultClinet(credentials);
    }

    constructor(credentials) {
        this.client = new keyVault.KeyVaultClient(credentials);
    }

    async getSecrets(vaultName) {
        return this.client.getSecrets(`https://${vaultName}.vault.azure.net/`);
    }

    async getSecret(vaultName, secretName) {
        return this.client.getSecret(`https://${vaultName}.vault.azure.net/`, secretName, '');
    }
}

async function getClient() {
    const primary = await AzCliKeyVaultClient.get();
    if (primary !== undefined) {
        console.log("Using Azure CLI");
        return primary;
    }
    return MsRestAzureKeyVaultClinet.get();
}

(async () => {
    const rcP = rcTools.loadRC();
    const clientP = getClient();
    const [client, rc] = await Promise.all([clientP, rcP]);

    if (rc.secrets === undefined) {
        rc.secrets = {};
    }

    // Primary key vault for test/dev secrets shared by Microsoft-internal teams working on FF
    await getKeys(client, rc, "prague-key-vault");

    try {
        // Key Vault with restricted access for the FF dev team only
        await getKeys(client, rc, "ff-internal-dev-secrets");
        console.log("Overrode defaults with values from the FF internal keyvault.");
    } catch (e) { }
    await rcTools.saveRC(rc);
})().catch(e => {
    console.error(`FATAL ERROR: ${e.stack}`);
    process.exit(-1);
});
