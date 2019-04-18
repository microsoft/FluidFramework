# Files and Directories
* **manifest.json**<br><br>
This file is a skeleton of a manifest file that can be used to sideload this project into a Teams team.  In order to make this complete, there are a few places that need to be overwritten to match the specific user's project.<br><br>
APP_ID - Replace all of these entries with a user created guid should be put here, e.g. take the registered bot id from bot framework and replace the last four characters with '9999'.<br><br>
BASE_URI - Replace all of these entries with the base uri of your currently running app, e.g. https://ba96ff0a.ngrok.io or Azure domain<br><br>
REGISTERED_BOT_ID - Replace all of these entries with the app id of your registered bot.<br><br>
BASE_URI_EXCLUDING_HTTPS:// - Replace all of these entries with the specific domain name of your currently running app excluding https://, e.g. ba96ff0a.ngrok.io or the Azure domain name.