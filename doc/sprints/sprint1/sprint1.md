# Welcome to Sprint 1 

In Sprint 1 we will investigate key design questions and we will begin to prototype the Office framework,
our set of MUI components.  This set of components includes domain-specifc MUIs such as calendars, 
container MUIs such as the flex, flow, list, and grid containers, and MUIs that connect to services such as
the Excel range MUI.

Sprint 1 starts now and finishes January 20th, 2017.  

Sprint 1 will have five feature teams.  We will balance the feature teams so 
that each team will have diverse skills, including JavaScript, native coding,
and intelligent services.  Sprint 2 will likely have different feature teams.

The five feature teams are:

1. Data Services (David Conger, Yang Gao, KoshN, Dan Cheung/Ash Morgan)
2. Excel (Mark Young, Shaofeng, Alex Croicu, Mark Schmidt)
3. Data Model (Kurt, Alex, Ali, Igor, Ben, Gabe Hall)
4. Canvas (David Lee, Ilya tumonov, IgorZV, Rob Little, Brian Holly)
5. Ink UX + Intelligence (Ian, Matt Ruhlen, Sam Broner, TBD Igor)

The data services team will build MUIs around key data sources, including
document metadata, Satori, Office Graph, and CDM.  This team will also investigate how our MUIs can
use intelligent services such as spell check and investigate scenarios like people, org charts, 
document metadata.

The Excel team will prototype the Excel range MUI, including how to use the Excel service and how
to manage Excel ranges within a container.  

The data model team will service the other four teams by co-investigating and
prototyping solutions to component model, collaboration infrastructure and representation of
MUI container content.

The canvas team will build a prototype of the two main container MUIs (flow and flex) and UI and 
behavior of the timeline functionality.

The ink team will build a prototype of collaborative ink in the flex container, including split
screen and other view transformations. The ink team will investigate ink recognition and smoothing.

The data services team will investigate the following questions:

* Can we incorporate intelligent services such as spell check into our text block
MUI?  How do we separate this service from its dependence on app-specific
data structures?
* How should we show data for entities like People, Orgchart, and document metadata?
* How should we build a calendar MUI that incorporates diverse data sources?
* How should we show rich visualizations of enterprise data sources?
* How can we visualize graphs such as LinkedIn, Office, Facebook?

The Excel team will investigate the following questions: 

* How do we back a set of Excel range MUIs with the Excel service? How do we make it easy to 
create the OneDrive file required for the Excel service?  
* Are there alternatives (could the Excel service run on some other backing store, for example a REST API for storage)?  How do we map 
multiple Excel ranges to a single Excel file?  
* How does the container MUI manage the set of ranges? 
What is the component model for managing a set of MUIs at the container level?  Can we map each range to
a separate sheet, or are cross-sheet references too expensive?
* How do we use the OT model developed for desktop Excel to support collaboration on Excel range MUIs?
* How do incorporate Lumen insights into the container UI?
* How do we highlight Yellow?

The data model team will investigate the following questions:

* What is the container model for MUIs?  Does it vary between different container types? 
* How do containers handle references and other cross-container information such as annotations?
* How does the collaboration model and container representation relate to providing a timeline and
query over revision history?  What are the semantics of rolling back? Do we need branches?
* How do we federate the operation log among MUIs in a container?
* How do we design our component model so that compound MUIs have excellent interactive response?
* How do UX events flow in a MUI hierarchy?
* How do we use the DOM (or other scripted native scene graphs) as a viewport but keep a separate 
representation to make memory use is minimized, incremental load is possible, and view transformations
are speedy?
* How do we ensure that timeline/replay operations can work over the data model of the MUI independent
of the view model for that MUI (including multiple transformed views)?
* How will we ensure that native UX can mix into our canvas, at least on Windows?  How do we ensure that
non-Windows experiences are still excellent even if we have some touch, ink, or performance 
advantages on Windows?
* Should we use the 1D stream control as our first native UX element?

The canvas team will investigate the following questions:

* How should the timeline UX provide checkpoints, undo, temporary undo (go back to point in time)
and time-synchronized replay?
* How can we use gestures and other UX to learn relationships among MUIs and between ink and MUIs so that 
we can sensibly lay out flex container MUI collections on diverse devices?  
* What is the UX for sharing and privacy, including elimination of some timeline stretches?
* How will we show MUIs built around IVisual data in the Flex container?
* How should we build a 1D stream control for listing MUIs?  How will we
get sufficient performance in MUI preview to "flick scroll" the stream control? How can we
make sure all MUIs can load incrementally with optional "splash screen"?
* How do we think about re-layout from flow container to diverse devices?
* What is the UX for scaling, selection, and semantic lifting?
* How do we think about UX for having flex and flow containers stacked or side by side?

The ink team will investigate the following questions:

* How do we smooth ink in Edge using low-latency client-side code?
* How can we recognize basic shapes, numerals and other symbols using ink? Can we
adapt code to use as client-side JavaScript? Can we build a service with 
reasonable latency?  Can we identify the key teams in Office and AI/MSR that
could supply code or algorithms?
* Can we recognize ink well enough to use it for UX commands?
* How can we raise MUIs above the ink layer so you can ink directly on them?
* How can we auto-scale MUIs so they're easier to ink on and return them to their
original scale?
