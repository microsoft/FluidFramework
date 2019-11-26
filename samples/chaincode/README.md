# Chaincode

Use [Yo Fluid](../../tools/generator-fluid/README.md) to start building components and chaincode.

## What's a chaincode?
A chaincode is a installable block of code. They often create web components following the [Fluid component model](../../docs/architecture/components/web-component-model.md).

## How do I build a chaincode?
Build a chaincode with [Yo Fluid](../../tools/generator-fluid/README.md). We strongly suggest using Yo Fluid as your starting point. For more exotic features, you can look through the examples in this directory.

## How do I deploy a chaincode?

To deploy and make your chaincode "Live" you'll have to deploy it to verdaccio, our private NPM repository.

Go to https://packages.wu2.prague.office-int.com

Login with:

    UN: prague
    PW: 8Fxttu_A

And follow the npm adduser steps

To deploy, use

    npm run deploy


To view your chaincode, you can go to the URL

    https://www.wu2-ppe.prague.office-int.com/loader/fluid/{random container name}?chaincode={pkg.name}@{pkg.version};

This link is then shareable and, in an expanding list of components, embeddable!


## Troubleshooting
If you find a broken chaincode, feel free to fix it. We iterate on chaincode examples very quickly. The most recently updated chaincodes will always be working, but we don't guarantee updates to older chaincode.

If you have questions, please use the [Microsoft internal StackOverflow](https://stackoverflow.microsoft.com/) using the [tag Fluid](https://stackoverflow.microsoft.com/questions/tagged/fluid)
