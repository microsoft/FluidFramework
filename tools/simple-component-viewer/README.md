# Simple Component Loader
This is a basic page that let's your load Routerlicious or SPO components.

Components are loaded into their own iFrame so the all act independently of each other. They will have their own instance of the code and connect on an independent websocket connection

## Getting started
- run `npm run auth`
- then `npm install`
- then `npm start`

## Getting SPO information

### Url
- Copy the url from the open file for the Scriptor document
- Press the copy button from the table to get just the table component

### Token
- Open an SPO file with debugger tools running.
- In the network tab search for `JoinSession`
- Copy the access token off the url `access_token=[copy this part]`
