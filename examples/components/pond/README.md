# Pond

The pond is a grab bag of fluid scenarios.

## Getting Started

To start coding, open this directory in your IDE and check out ./src/index.tsx

You can try the following commands

```node
    npm start
       Hosts the component at http://localhost:8080


    npm run build
       Builds the component into bundled js files


    npm run deploy
       Publishes the chaincode to https://packages.wu2.prague.office-int.com/#/
```

We suggest you start by typing:

```node
npm start
```

## Deploy

To deploy and make your chaincode "Live" you'll have to deploy it to verdaccio, our private NPM repository.

Go to https://packages.wu2.prague.office-int.com

Login with:

> UN: prague
> PW: 8Fxttu_A

And follow the npm adduser steps

To deploy, use

```node
npm run deploy
```

To view your chaincode, you can go to the URL

> https://www.wu2-ppe.prague.office-int.com/waterpark?chaincode={pkg.name}@{pkg.version};

This link is then shareable and, in an expanding list of components, embeddable!

## NPM or VSTS Auth Issue

[Stack Overflow Issue](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

If you run into an auth issue. Please set up your .npmrc. This is a common issue during npm install.

For windows: https://www.npmjs.com/package/vsts-npm-auth

For mac you’ll need to add credentials to your npmrc manually. Go to this link, https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=prague, click on “Connect to Feed” select NPM on the left, and follow the instructions.
