---
title: Glossary
aliases:
  - "/docs/glossary/"
  - "/docs/start/glossary/"

---

## Aqueduct

The `@fluidframework/aqueduct` package is a library for building Fluid objects and Fluid containers within the Fluid
Framework. Its goal is to provide a thin base layer over the existing Fluid Framework interfaces that allows developers
to get started quickly. [Learn more.](https://fluidframework.com/apis/aqueduct/)

## Code loader

If your app is bundled separately from your container code, Fluid can use a code loader to download
and load the container code bundle dynamically.

## Container

The container is your application's entry point to the Fluid Framework. It runs your container code and is
the object through which you'll retrieve your Fluid objects.

## Container code

You'll write container code to define which Fluid objects your scenario uses and how you'll access them.

## DataObject

Aqueduct's implementation of a Fluid object. Designed to organize distributed data structures into
semantically meaningful groupings for your scenario, as well as, providing an API surface to your data.

## Distributed data structures (DDSes)

DDSes are the data structures Fluid Framework provides for storing collaborative data. As collaborators modify the data,
the changes will be reflected to all other collaborators.

## Fluid loader

Responsible for connecting to a Fluid service and loading a Fluid container.

## Fluid object

Any JavaScript object that implements Fluid feature interfaces.

## Fluid service

A service endpoint that is responsible for receiving, processing, storing, and broadcasting operations.

## Fluid service driver

Client code responsible for connecting to the Fluid service.

## Shared object

A distributed data structure (DDS) or `DataObject`.

## URL resolver

Fluid's API surface makes use of URLs, for example in the `Loader`'s `resolve()` method and `Container`'s `request()`
method.  The URL resolver is used to interpret these URLs for use with the Fluid service.
