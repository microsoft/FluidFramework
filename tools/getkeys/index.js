/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs =  require("fs");
const os =  require("os");
const path =  require("path");
const util =  require("util");
const { exec } = require('child_process');
const msRestAzure = require("ms-rest-azure");
const keyVault = require("azure-keyvault");
const rcTools = require("@fluidframework/tool-utils");

const appendFile = util.promisify(fs.appendFile);

// Wraps the given string in quotes, escaping any quotes already present in the string
// with '\"', which is compatible with cmd, bash, and zsh.
function quote(str) {
    return `"${str.split('"').join('\\"')}"`;
}

// Converts the given 'entries' [key, value][] array into export statements for bash
// and zsh, appending the result to the given 'shellRc' file.
async function exportToShellRc(shellRc, entries) {
    const rcPath = path.join(os.homedir(), shellRc);
    console.log(`Writing '${rcPath}'.`);

    const stmts = `\n# Fluid dev/test secrets\n${
        entries.map(([key, value]) => `export ${key}=${quote(value)}`).join("\n")
    }\n`;

    return appendFile(rcPath, stmts, "utf-8");
}

// Persists the given 'env' map to the users environment.  The method used depends
// on the user's platform and login shell.
async function saveEnv(env) {
    const entries = Object.entries(env);

    // Note that 'SHELL' return's the user's login shell, which isn't necessarily
    // the shell used to launch node (e.g., if the user is running a nested shell).
    // However, the environment will be inherited when their preferred shell is
    // launched from the login shell.
    const shell = process.env.SHELL;
    const shellName = shell && path.basename(shell);
    switch (shellName) {
        case "bash":
            return exportToShellRc(
                // '.bash_profile' is used for the "login shell" ('bash -l').
                process.env.TERM_PROGRAM === "Apple_Terminal"
                    ? ".bash_profile"
                    : ".bashrc",
                entries);
        case "zsh":
            return exportToShellRc(".zshrc", entries);
        case "fish":
            console.log("Writing '~/.config/fish/fish_variables'.");

            // For 'fish' we use 'set -xU', which dedupes and performs its own escaping.
            // Note that we must pass the 'shell' option, otherwise node will spawn '/bin/sh'.
            return Promise.all(
                entries.map(([key, value]) => execAsync(`set -xU '${key}' '${value}'`, { shell }))
            );
        default:
            if (!process.platform === "win32") {
                throw new Error(`Unsupported shell: '${shellName}'.`);
            } else {
                console.log("Writing 'HKEY_CURRENT_USER\\Environment'.");

                // On Windows, invoke 'setx' to update the user's persistent environment variables.
                return Promise.all(
                    entries.map(([key, value]) => execAsync(`setx ${key} ${quote(value)}`))
                );
            }
    }
}

async function getKeys(keyVaultClient, rc, vaultName) {
    console.log(`\nGetting secrets from ${vaultName}:`);
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
                    console.log(`  ${envName}`);
                    rc.secrets[envName] = response.value;
                })());;
            }
        }
    }

    return Promise.all(p);
}

async function execAsync(command, options) {
    return new Promise((res, rej) => {
        exec(command, options, (err, stdout, stderr) => {
            if (err) {
                rej(err);
                return;
            }
            if (stderr) {
                console.log(stderr + stdout);
            }
            res(stdout);
        });
    });
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
    const rc = await rcTools.loadRC();

    if (rc.secrets === undefined) {
        rc.secrets = {};
    }

    // For debugging, change the following to 'false' to skip connecting to
    // Azure Key Vault and instead use the secrets cached in '~/.fluidtoolrc'.
    if (true) {
        const client = await getClient();

        // Primary key vault for test/dev secrets shared by Microsoft-internal teams working on FF
        await getKeys(client, rc, "prague-key-vault");

        try {
            // Key Vault with restricted access for the FF dev team only
            await getKeys(client, rc, "ff-internal-dev-secrets");
            console.log("\nNote: Default dev/test secrets overwritten with values from internal key vault.");
        } catch (e) { }
    }
    
    console.log(`\nWriting '${path.join(os.homedir(), ".fluidtoolrc")}'.`);
    await rcTools.saveRC(rc);
    await saveEnv(rc.secrets);

    console.warn(`\nFor the new environment to take effect, please restart your terminal.\n`)
})().catch(e => {
    console.error(`FATAL ERROR: ${e.stack}`);
    process.exit(-1);
});
