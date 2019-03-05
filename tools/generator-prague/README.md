# Prague Generator

Use this tool to quickly bootstrap a counter chaincode example.

To set up, do these one time steps.
````bash
npm install -g yo

cd .../Prague/tools/generator-prague

npm install
npm link
````


You can now bootstrap a new counter chaincode at any time. 

Try it now.
````bash
yo prague
````

#### NPM or VSTS Auth Issue

If you run into an auth issue. Please set up your .npmrc.

For windows: https://www.npmjs.com/package/vsts-npm-auth

For mac you’ll need to add credentials to your npmrc manually. Go to this link, https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=prague, click on “Connect to Feed” select NPM on the left, and follow the instructions.

