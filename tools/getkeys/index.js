/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import child_process from "child_process";
import interactiveLogin from "ms-rest-azure";
import KeyVaultClient from "azure-keyvault";
import { loadRC, saveRC } from "@fluidframework/tool-utils";

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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    const shellName = shell && path.basename(shell, path.extname(shell));
    switch (shellName) {
        // Gitbash on windows will appear as bash.exe
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
                entries.map(async ([key, value]) => execAsync(`set -xU '${key}' '${value}'`, { shell })),
            );
        default:
            if (!process.platform === "win32") {
                throw new Error(`Unsupported shell: '${shellName}'.`);
            } else {
                console.log("Writing 'HKEY_CURRENT_USER\\Environment'.");

                // On Windows, invoke 'setx' to update the user's persistent environment variables.
                return Promise.all(
                    entries.map(async ([key, value]) => execAsync(`setx ${key} ${quote(value)}`)),
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
            const secretName = secret.id.split("/").pop();
            // exclude secrets with automation prefix, which should only be used in automation
            if (!secretName.startsWith("automation")) {
                p.push((async () => {
                    const response = await keyVaultClient.getSecret(vaultName, secretName);
                    const envName = secretName.split("-").join("__"); // secret name can't contain underscores
                    console.log(`  ${envName}`);
                    rc.secrets[envName] = response.value;
                })());
            }
        }
    }

    return Promise.all(p);
}

async function execAsync(command, options) {
    return new Promise((res, rej) => {
        child_process.exec(command, options, (err, stdout, stderr) => {
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
        await execAsync("az ad signed-in-user show");
        return new AzCliKeyVaultClient();

        // Disabling fallback to REST client while we decide how to streamline the getkeys tool

        // try {
        //     await execAsync("az account set --subscription Fluid");
        //     return new AzCliKeyVaultClient();
        // } catch (e) {
        //     return undefined;
        // }
    }

    async getSecrets(vaultName) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(await execAsync(`az keyvault secret list --vault-name ${vaultName}`));
    }

    async getSecret(vaultName, secretName) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(await execAsync(`az keyvault secret show --vault-name ${vaultName} --name ${secretName}`));
    }
}

class MsRestAzureKeyVaultClinet {
    static async get() {
        const credentials = await interactiveLogin();
        return new MsRestAzureKeyVaultClinet(credentials);
    }

    constructor(credentials) {
        this.client = new KeyVaultClient(credentials);
    }

    async getSecrets(vaultName) {
        return this.client.getSecrets(`https://${vaultName}.vault.azure.net/`);
    }

    async getSecret(vaultName, secretName) {
        return this.client.getSecret(`https://${vaultName}.vault.azure.net/`, secretName, "");
    }
}

async function getClient() {
    return AzCliKeyVaultClient.get();

    // Disabling fallback to REST client while we decide how to streamline the getkeys tool

    // const primary = await AzCliKeyVaultClient.get();
    // if (primary !== undefined) {
    //     console.log("Using Azure CLI");
    //     return primary;
    // }
    // return MsRestAzureKeyVaultClinet.get();
}

(async () => {
    const rc = await loadRC();

    if (rc.secrets === undefined) {
        rc.secrets = {};
    }

    // For debugging, change the following to 'false' and uncommented the if block to skip connecting to
    // Azure Key Vault and instead use the secrets cached in '~/.fluidtoolrc'.
    // if (true) {
    const client = await getClient();

    // Primary key vault for test/dev secrets shared by Microsoft-internal teams working on FF
    await getKeys(client, rc, "prague-key-vault");

    try {
        // Key Vault with restricted access for the FF dev team only
        await getKeys(client, rc, "ff-internal-dev-secrets");
        console.log("\nNote: Default dev/test secrets overwritten with values from internal key vault.");
    } catch (e) { }
    // }

    console.log(`\nWriting '${path.join(os.homedir(), ".fluidtoolrc")}'.`);
    await saveRC(rc);
    await saveEnv(rc.secrets);

    console.warn(`\nFor the new environment to take effect, please restart your terminal.\n`);
})().catch((e) => {
    if (e.message.includes("'az' is not recognized as an internal or external command")) {
        console.error(`ERROR: Azure CLI is not installed. Install it and run 'az login' before running this tool.`);
        // eslint-disable-next-line no-undef
        exit(0);
    }

    console.error(`FATAL ERROR: ${e.stack}`);
    process.exit(-1);
});
