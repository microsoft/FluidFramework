# TODO: This needs to be somewhere it'll be invoked on every shell start, not just when the codespace is initially
# created.
source agent-aliases.sh

sh ./playwright-setup.sh

echo "Installing Agency, which will require you to authenticate, so look for a popup window..."
curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency && exec $SHELL -l
echo "Agency installed and authenticated."
