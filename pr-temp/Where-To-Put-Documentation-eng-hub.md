## Overview

As with all large projects, the Fluid Framework requires a sizable amount of documentation.
That documentation lives in a number of different locations / systems.
It can sometimes be difficult to find the documentation you need.
Similarly, it can sometimes be hard to determine where new documentation should live.

This document aims to give simple guidance to make our documentation systems easier to navigate, and to ensure we have consistent policy with regards to where different forms of documentation should go.

## Documentation locations

The following are locations where Fluid Framework documentation can be found.
They are not presented in any particular order.

- [fluidframework.com](https://fluidframework.com/)
  - This is our customer-facing website.
    It is the public face of our product and is home to high-level overviews, samples, etc. to get users up-and-running on the framework.
- [Github Wiki](https://github.com/microsoft/FluidFramework/wiki)
  - This is the contributor-facing wiki for the [fluid-framework](https://github.com/microsoft/FluidFramework) repository.
  - It primarily contains documentation relevant to the open-source community, including contribution guidelines.
- [EngHub Wiki](https://eng.ms/docs/experiences-devices/oxo/office-shared/wacbohemia/fluid-framework-platform-internal/ff-platform-docs/docs/overview)
  - This is our Microsoft-internal only wiki.
    It is used to house documentation that is confidential or irrelevant to our open-source community.
- Source-code documentation
  - In addition to the above, our source-code is also a vital component to our overall documentation story.
  - A tailored selection of our generated API documentation can be found on `fluidframework.com` [here](https://fluidframework.com/docs/apis/).
  - The complete suite of our generated API documentation can also be found on our `EngHub` wiki [here](https://eng.ms/docs/experiences-devices/oxo/office-shared/wacbohemia/fluid-framework-platform-internal/ff-platform-docs/docs/apis/main).

## Where should I put new documentation?

The above list gives us an idea of locations in which we can find relevant documentation, but it doesn't give a good idea of where to look for specific kinds of documentation.
Nor does it help us determine where new documentation should be created.

When adding new documentation, please consider the following:

### Does my documentation contain any Microsoft-confidential information or information about our partners?

Internal / confidential documentation **_must_** be published to a secure location.
If you have any questions about this, please refer to [Microsoft's privacy policy (Microsoft internal)](https://microsoft.sharepoint.com/sites/privacy).

Generally, if such documentation is useful to the larger Fluid team, we recommend publishing it to our `EngHub Wiki`.

### Would my documentation benefit the open-source community?

Documentation that isn't internal, and *especially* documentation that would be of benefit to our open-source community should go in a public location!

Please **do not** publish such documentation to a private location such as the `EngHub Wiki`.

For general guidelines about where to put public documentation, please refer to our guide on the [github wiki](TODO: link once doc has been published).

### Team process / policy documentation

Generally speaking, Fluid team-specific policy and process documentation is not relevant to our open source community.
For this reason, we generally recommend putting such documentation on the `EngHub Wiki`.

This includes things like our release-process, meeting notes, etc.

That said, if there is a compelling reason to make this sort of information more public, and so long as it does not include internal / confidential information, it is also fine to put that information on the `Github Wiki`.
