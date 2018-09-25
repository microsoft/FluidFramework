Installation
============
* Start local Prague service
* cd /experiments/collab-browser/component && npm i && npm run update
* cd /experiments/collab-browser/extension && npm i && npm run build
* Go to chrome://extensions/
* Enable "Developer Mode" (toggle button in upper right)
* Click "Load Unpacked" (button in upper left)
* Select '/experiements/collab-browser/extension/dist' folder

Dev
===
* (Follow Installation instructions above)
* cd /experiments/collab-browser/extensions
* npm run dev