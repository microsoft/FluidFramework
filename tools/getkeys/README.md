# @fluid-internal/getkeys

This tool is specifically for Microsoft internal development.

This folder contains a script that will get secret values from the prague keyvault and persist them as environment
variables in all future consoles/shells. In order to have access to the prague keyvault you must be a member of the
prague-secrets or WAC Bohemia security group.

## How to use this tool

1. Install the [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli), run `az login` and authenticate
   with your Microsoft corporate account.
   - Choose Azure Subscription `Fluid` when prompted.
2. In this folder, run `pnpm install`, then `npm start`.

You should restart the console/shell after running the script (or for bash/zsh run `source ~/.bashrc` or `source ~/.zshrc`)
for the exported environment variables to become available.

## TO-DO

This tool had a fallback mechanism using REST to access Azure Keyvault if the Azure CLI wasn't installed, but it got
outdated and had issues (e.g. not retrieving all the existing secrets from the vault). Going forward we want to
streamline it and make it behave consistently for everyone who runs it; we might remove the (deactivated) REST
fallback approach, or fix it (start by updating the relevant NPM packages) and remove the AzureCLI flow. [Relevant
discussion](https://teams.microsoft.com/l/message/19:50292e8934024fc19d6ca2080dd7681e@thread.skype/1657054734667?tenantId=72f988bf-86f1-41af-91ab-2d7cd011db47&groupId=9ce27575-2f82-4689-abdb-bcff07e8063b&parentMessageId=1657054734667&teamName=Fluid%20Framework&channelName=Dev&createdTime=1657054734667).
