> [!CAUTION]
> This documentation is a work in progress.

# Fluid

Welcome to Fluid!

We built Fluid to make it simpler for developers to build collaborative experiences using Web technology.

Fluid enables distributed, collaborative applications by providing developers with eventually consistent <xref:dds>, a
flexible component and app model ("Chaincode"), and a reference server implementation ("Routerlicious.")

Teams across Microsoft are using Fluid for low latency collaboration, zero setup data persistence, and on-by-default
cross app compatibility. Among other projects, our partner teams are building components for text editing, gaming,
command line tooling, and IOT.

Fluid's [distributed data structures](xref:dds) make it easy to write apps that are collaborative just like you would build
single-user applications and experiences. Fluid handles keeping your data in sync across multiple clients, so you can
focus on your app's business logic. Fluid's data synchronization is fast, efficient, and requires very little
bandwidth. Fluid is extensible, too. You can write components which can be re-used or you can even create new
distributed data structures.

## Benefits

* You can focus on your app's business logic; Fluid takes care of data consistency between all clients
* It's easy to build 'version history' experiences with your data
* Components can be embedded in multiple places; reduce, reuse, recycle!

## Features

* Runtime ensures data consistency between all clients
* Data persistence including automatic change tracking for all of your data
* Data synchronization is ludicrously fast
* Easy to plug in custom components

## Build with Fluid

Use <xref:yo-prague> to get set up quickly.

First, do these one time steps:

````bash
npm install -g yo

cd .../Prague/tools/generator-fluid

npm install
npm link
````

Yo Fluid is now ready. Try it!

````bash
yo fluid
````

\* For Yo Fluid setup issues: [Unauthorized - Stack
Overflow](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

## Stack Overflow

The Fluid team answers questions on the [Microsoft internal stack overflow](https://stackoverflow.microsoft.com/) using
the [Prague](https://stackoverflow.microsoft.com/questions/tagged/prague) and
[Fluid](https://stackoverflow.microsoft.com/questions/tagged/fluid) tags.
