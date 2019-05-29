# Sprint 5
In sprint 5 we will begin to incubate the component model for interactive documents. Our focus will be on building a
demo-able scenario that allows us to explore what is a container provider, how does data bind and flow, how components
can expose their context to services like search, and how to make all interactions recordable. We will build on top of
our existing data model of distributed data types.

Our scenario will involve writing prose, inserting a cell component inline with the prose, writing more prose, then
inserting a chart component that binds a function against the values contained in the cell. After inserting more prose
a final quiz component will be inserted with a multiple-choice test. By having a library of components we will be able
to update the demo by changing how we intermix components inside the interactive document. This will allow us to
explore the component model in the context of building a textbook of the future and modern newspaper.

The sprint will run from April to September.

## Component model Tasks

### Inclusions

Be able to insert components inline with the flow of the document

### Layout

Allow components to be able to negotiate their size

### Example components

Cells, tables, charts, maps, code editor, edu interactives, quizzes, etc...

### Data flow

Components need to be able to communicate and send data between each other

### Dynamic load

package.json for interactive documents 

### UI for insertion and binding of components

### Blob support

We will need to support storing large data out of band of the normal message flow. This enables embedding GIFs, videos,
images, large blobs, etc... in the message stream without causing huge operation packets. This is similar to Git LFS.
