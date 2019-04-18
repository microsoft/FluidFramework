Installation
============
* Build Routerlicious
* Start local Prague service
* cd /experiments/collab-browser/component && npm i && npm run update
* cd ../extension && npm i && npm run build
* In browser, go to "chrome://extensions/"
* Enable "Developer Mode" (toggle button in upper right)
* Click "Load Unpacked" (button in upper left)
* Select '/experiements/collab-browser/extension/dist' folder

Dev
===
To use HMR with /extension/, use "npm run dev".
To rev the /component/, use "npm run update".