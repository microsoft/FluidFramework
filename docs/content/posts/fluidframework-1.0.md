---
title: Announcing Fluid Framework 1.0
date: "2021-11-18"
author:
  name: Tyler Butler
  github: tylerbutler
---


Today the Fluid team is very excited to announce the release of Fluid Framework 1.0. You can get started today with our
[new getting started guide,] or, if you have existing apps using earlier versions of the framework, we've written [a guide for moving to 1.0] that will help you upgrade to 1.0 with minimal effort.

Since this is a major release, we are committed to not making breaking changes in minor and patch releases, since we follow [Semantic Versioning 2.0.] For those of you who have been with us for a while - this should come as especially good news.

We know that working with a constantly changing API is frustrating at best, and we truly appreciate the community's continued patience as we shaped 1.0. In particular, we'd like to thank the following folks for contributing to our 1.0 release by filing issues, submitting PRs, or giving us feedback through other channels:

TODO: LIST OF EXTERNAL CONTRIBUTORS

## What can I do with 1.0?

The 1.0 packages are supported against the [Azure Fluid Relay], so you can start sharing your Fluid-powered apps with the world today. See the [How to deploy a Fluid app using Azure Fluid Service] article for more information. For pricing information, please see the [Azure Fluid Service documentation.]

The Fluid team is committed to supporting additional service options as they become available. If you know of a service that is not included in our [list of Fluid services], please [open an issue] and let us know.

## Package scopes, versioning, and supportability

The Framework is composed of ~150 different npm packages, representing client and server code as well as shared code between the two. Historically, most of our packages were published under the @fluidframework scope.

Earlier this year, we introduced the @fluid-experimental npm scope and published several packages to that scope while we iterated on the implementations. With 1.0, we are formalizing the scopes of our packages to make this clearer. @fluid-experimental packages are just that, experimental, while @fluidframework packages versions >= 1.0 are [production ready.]

This means that with 1.0, some packages have moved between scopes, and you'll need to update your dependencies to the 1.0 @fluidframework packages. We've written [a guide for moving to 1.0] that will help you upgrade to 1.0 with minimal effort.

Server packages are versioned separately from the client packages, though they are all published under the @fluidframework scope. The compatible versions of the client libraries with a given service can be found in our [list of Fluid services], including options for self-hosting Routerlicious yourself.

For 1.0, it's simple: the 1.0 client packages are all supported against the XXXXX version of Routerlicious, and the now-available Azure Fluid Service.

What's new?

The 1.0 release contains a number of improvements to the framework, especially around ease of use and reliability. We have sharpened our focus within the Framework on the data layer and have clarified that Fluid is unopinionated about UI and UI frameworks. Fluid 1.0 is all about data.

TODO: Finish
