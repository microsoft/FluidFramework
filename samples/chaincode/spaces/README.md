# Spaces

**Spaces** is a Fluid component that provides a grid layout for users to compose their own experiences by adding and re-arranging components. This is a beginner thought exercise at how document types could work.

## Components

The spaces package pulls in a collection of outside components and also has a few internal components that can be found at `./src/components`. The internal components simply offer more functionality for prototyping.

## Container Services

The `Manager` is the only container service here. It uses very primitive implementation of the Producer/Consumer pattern.

## Template

Template allows you to save and re-use a layout. When you click the `Template` button it will save the current layout. If you want to create a new document with the same layout add the `?template` to the url when creating a new doc.
