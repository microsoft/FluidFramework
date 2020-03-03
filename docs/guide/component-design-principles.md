# Design principles

## Component model

1. **Fluid components and application services should follow web best practices.**  For example, Fluid components
   should adhere to W3C guidelines for accessibility. Fluid components may for reason of policy refuse to load other
   components.

2. **Fluid components communicate through shared data.**  For data model communication, Fluid components should use
   collaboration through distributed data structures. No separate data binding abstraction is required. Application
   service implementers should provide services (such as search) through shared data.

3. **Locality.**  Fluid components must adhere to the following locality rules:

    a. Components connect to the DOM by providing to their container component a root element; the container places the
    root element in the appropriate DOM context.

    b. Components isolate all side-effects (including CSS) to their DOM subtree.

4. **Pay for play.**  A web component requires no additional code to become a Fluid component. Developers can add
   Fluid services (collaboration, storage) and Fluid app services (search, footnotes) using effort proportional to the
   benefit of the service.

5. **The Fluid component model never overrides the DOM.**  Component interaction through the DOM continues to work as
   expected. For example, if a Fluid component executes `element.focus()` it can expect that subsequent keyboard events
   will arrive at `element` and that the element previously holding the keyboard focus will receive a `blur` event.

In summary, Fluid components communicate through shared data structures. Where the DOM specifies interactions among
visual components, components must communicate using the DOM. For data model communication, components should use Fluid
distributed data structures.

## Component mechanism

The Fluid component mechanism implements services such as loading, message distribution, storage, and security. The
Fluid component model is layered on top of the Fluid component mechanism and handles web (JavaScript, HTML, CSS) modules
that modify only their own DOM sub-tree.

1. **Leverage existing tool chains.** The energy and growth of the web developer ecosystem is unmatched. The Fluid
   component mechanism enables developers to fully utilize both their current tools and libraries of choice and ones
   that will be developed in the future.

2. **Be the web.** The web has an established code + data mechanism in HTML/JavaScript. As well as naming and
   distribution with HTTP. Fluid components embrace this existing technology to add new features like versioning as
   source control and a component model for the web.

3. **Load independence of shared objects.** Fluid components, and the data structures they contain, must be able to
   load and process deltas independently of any other component. Higher level code may introduce bindings between them.

4. **Components are independent of their container.** A container serves as a host for a component. But a component must
   be promotable to a new container.

5. **Trusted computing base with mobile code.** The base of Fluid provides the minimal amount of code to load and run
   code + data packages. By being minimal it can be tested thoroughly and updated infrequently. And by embracing dynamic
   code loading it can be extended with the full power of the web.

6. **Identity and access control provided by the host.** Fluid delegates identity and access control to the hosting
   site for the container. The hosting site is responsible for authorizing access to a container.

In summary, the Fluid component mechanism provides a minimal set of code that can deliver services such as loading,
message distribution, storage, and security.
