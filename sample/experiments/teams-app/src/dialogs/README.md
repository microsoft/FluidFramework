# Files and Directories
* **RootDialog.ts**<br><br>
This file is the main dialog entry point and container for all of the child dialogs.  This file serves three main purposes.  First, it creates all of the child dialogs by instantiating them.  Instantiating these dialogs will create the dialogs and add them to the bot.  Next, it gives the point where, if no match of a user's input is found, the bot will respond by using this dialogs _onDefault method.  Finally, if you wish to add a different kind of recognizer (such as a Luis Natural Language recognizer), then this would be the file in which to add this.  Note that an example of this exists, but it is currently commented out.

* **examples**<br><br>
This directory holds all of the dialog examples this project gives.

# Creating a New Dialog
