source agent-aliases.sh

echo "AI agent aliases loaded. Available agents: haiku, sonnet, opus."

echo "Installing Agency, which will require you to authenticate, so look for a popup window..."
curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency && exec $SHELL -l
