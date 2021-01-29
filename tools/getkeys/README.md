# @fluid-internal/getkeys

This tool is specifically for Microsoft internal development.

This folder contains a script that will get secret values from the prague keyvault and persist them as environment variables in all future consoles/shells. In order to have access to the prague keyvault you must be a member of the prague-secrets or WAC Bohemia security group.

To run the script, run `npm i`, then `npm start`. The script will then prompt you to use a code to login to your Microsoft account. You should restart the console/shell  after running the script, or for bash/zsh run `source ~/.bashrc` or `source ~/.zshrc`.
