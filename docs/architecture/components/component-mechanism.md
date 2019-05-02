---
uid: component-mechanism
---

# Component Mechanism

This document summarizes the design principals for the Prague component mechanism, which implements services such as
loading, message distribution, storage, and security. A companion document exists which describes the [Prague web
component model](./web-component-model.md). This is layered on top of the Prague component mechanism and handles web
(JavaScript, HTML, CSS) modules that modify only their own DOM sub-tree.

1. **Leverage existing tool chains.** The energy and growth of the web developer ecosystem is unmatched. The Prague
   component mechanism enables developers to fully utilize both their current tools and libraries of choice and ones
   that will be developed in the future.

2. **Be the web.** The web has an established code + data mechanism in HTML/JavaScript. As well as naming and
   distribution with HTTP. Prague components embrace this existing technology to add new features like versioning as
   source control and a component model for the web.

3. **Load independence of shared objects.** Prague components, and the data structures they contain, must be able to
   load and process deltas independently of any other component. Higher level code may introduce bindings between them.

4. **Components are independent of their container.** A container serves as a host for a component. But a component must
   be promotable to a new container.

5. **Trusted computing base with mobile code.** The base of Prague provides the minimal amount of code to load and run
   code + data packages. By being minimal it can be tested thoroughly and updated infrequently. And by embracing dynamic
   code loading it can be extended with the full power of the web.

6. **Identity and access control provided by the host.** Prague delegates identity and access control to the hosting
   site for the container. The hosting site is responsible for authorizing access to a container.

In summary, the Prague component mechanism provides a minimal set of code that can deliver services such as loading,
message distribution, storage, and security.
