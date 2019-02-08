This document summarizes the design principles for the Prague web component model.   A companion document
describes the design principles for the [Prague component mechanism](./component-mechanism.md), which implements component services such as
loading, event distribution and security.  In the document, we use the term web component to describe a web
(JavaScript, HTML, CSS) module that modifies only its own DOM sub-tree.  

1. **Prague components and application services should follow web best practices.**  For example, Prague components
should adhere to W3C guidelines for accessibility.  Prague components may for reason of policy refuse to load other
components. 

2. **Prague components communicate through shared data.**  For data model communication, Prague components should use
collaboration through distributed data structures.  No separate data binding abstraction is required.  Application
service implementors should provide services (such as search) through shared data.   

3. **Locality.**  Prague components must adhere to the following locality rules: 
  
    a. Components connect to the DOM by providing to their container component a root element; the container places
    the root element in the appropriate DOM context. 

    b. Components isolate all side-effects (including CSS) to their DOM subtree. 

4. **Pay for play.**  A web component requires no additional code to become a Prague component.    Developers can add Prague
services (collaboration, storage) and Prague app services (search, footnotes) using effort proportional to the benefit
of the service. 

5. **The Prague component model never overrides the DOM.**  Component interaction through the DOM continues to work as
expected.  For example, if a Prague component executes `element.focus()` it can expect that subsequent keyboard
events will arrive at `element` and that the element previously holding the keyboard focus will receive a `blur` event.  

In summary, Prague components communicate through shared data structures.  Where the DOM specifies interactions
among visual components, components must communicate using the DOM.  For data model communication, components
should use Prague distributed data structures. 

 