---
title: Glossary
---

**Code loader** - If your app is bundled separately from your container code, Fluid can use a code loader to download and load the container code bundle dynamically.

**Container** – The container is your application’s entry point to Fluid Framework. It runs your container Code and is the object through which you’ll retrieve your data objects.

**Container code** – You’ll write container code to define which data objects your scenario uses and how you’ll access them.

**Data objects** – You’ll write data objects to organize DDSes into semantically meaningful groupings for your scenario. You can define their API surface to control how collaborators will modify the data.

**Distributed data structures (DDSes)** – DDSes are the data structures Fluid Framework provides for storing the collaborative data. As collaborators modify the data, the changes will be reflected to all other collaborators.

**Fluid loader** - Responsible for connecting to a Fluid service and loading a Container.

**Fluid runtime** -

**Fluid service** – The container will connect to a service to send and receive changes to collaborative data.

**Fluid service driver** - Client code responsible for connecting to the Fluid service.

**Url resolver** - Fluid's API surface makes use of urls, for example in the `Loader`'s `resolve()` method and `Container`'s `request()` method.  The url resolver is used to interpret these urls for use with the Fluid service.
