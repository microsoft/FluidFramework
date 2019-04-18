# Files and Directories
* **app.ts**<br><br>
This file is the main startup and entrypoint into the node server.  It uses express to set up its endpoints.  It sets up the public directory (at the highest level of the project) and the build/src/public directories to be static directories in order to serve out their static image, javascript, and html files.  It sets up the bot using a TeamsChatConnector listening for post messages on the /api/messages endpoint.  It also gives a place to setup third party data storage of bot state, if you are far enough long to set this up.  Finally, it sets up the /api/oauthCallback endpoint to handle the OAuth 2.0 callback from the Visual Studio Team Services (VSTS) authentication example.  The current default port number for all of this is 3978.

* **Bot.ts**<br><br>
This file is the main starting point for your bot.  Its three main jobs are to instantiate the RootDialog, which is the main starting point for all of the chat responses your bot will make; to add the middleware that is used by your bot; and to create the handlers that are used for the special events Teams may send to your bot.  These are currently:<br><br>
Invoke Events - triggered by invoke buttons<br>
Query Events - triggered by Compose Extension searches<br>
Conversation Update Events - triggered by doing things such as adding the bot to a team, adding a new member to the team, etc.

* **apis**<br><br>
This holds the files needed to set up the Visual Studio Team Services (VSTS) OAuth 2.0 example, the files needed to make the VSTS api calls, and the files for a very lightweight hardcoded OAuth 1.0 example (which is never actually used for any of the calls in these examples - it is meant to mearly be another example should you need it as a reference).

* **config**<br><br>
This holds the json files needed to configure the config tool.  With this tool, environment variables are referenced using strings and object notation, such as "bot.botId", rather than by the environment variables actual name, such as "MICROSOFT_APP_ID".

* **dialogs**<br><br>
This holds all of the dialogs that handle the bot's responses.  It is recommended that this directory be your starting point when investigating this project.

* **locale**<br><br>
This holds the json files which are used by your bot to get the preloaded chat responses.  In this way, your bot can be multilingual simply by translating these preloaded responses into another language and putting these translated responses into the appropriate directory.

* **middleware**<br><br>
This holds the middleware which can be used by your bot for every incoming message.

* **storage**<br><br>
This holds the storage files which can be used to set up third party data storage.  The example here uses MongoDB.

* **tab**<br><br>
This holds the file used to dynamically create the configurable tab's and static tab's content.

* **utils**<br><br>
This holds all of the utility files.  Here, the base dialog classes, dialog IDs, dialog matching regular expressions, and utility functions are all defined.