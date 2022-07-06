# @fluid-internal/getkeys

This tool is specifically for Microsoft internal development.

This folder contains a script that will get secret values from the prague keyvault and persist them as environment
variables in all future consoles/shells. In order to have access to the prague keyvault you must be a member of the
prague-secrets or WAC Bohemia security group.

It is recommended that you have the [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed.
The tool will first try to use the Azure CLI to retrieve the secrets from Azure Keyavault; if Azure CLI is not instaled,
it will fall back to an approach using REST calls that might be the cause of some issues we've seen in the past (e.g. not
retrieving all the existing secrets from the vault).

To run the script, run `npm install`, then `npm start`. The script will then prompt you to use a code to login to your
Microsoft account. You should restart the console/shell after running the script (or for bash/zsh run `source ~/.bashrc`
or `source ~/.zshrc`).
