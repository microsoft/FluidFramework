# Sprint 4

Previous sprints have focused on prototyping our core system and paying down technical risk. We exited sprint 3
being able to both describe our full architecture as well as show it in demos given to both partner teams and senior
leadership to great success. We are incredibly confident in what we have built and are ready for ourselves and others to
start taking dependencies on it.

In sprint 4 we will transition the system from demo quality to being self hostable. We will exit this sprint with a system
that is stable and reliable enough for every day usage. We will create, store, and share our core documentation and design
notes using Prague. And the routerlicious service itself will be stable enough to onboard and support usage coming from
various partner teams.

The sprint will run from January to March.

## Self-host Tasks

To enable self hosting we will need to complete the following tasks.

### Stable storage

Documents created with the system need to be stable and available. On schema changes we will need to either migrate data
or be able to support older versions. We also will want to migrate to a more stable storage platform including both GitHub
and SharePoit.

### View stability

The flow view will be stable and reliable enough for every day use. It will behave as expected from a modern editor.

### Service stability

The service will be hardened to have high uptime and stable performance. We will invest in automated tooling to ensure this.

### View features

We will extend the flow view to have the 'muscle memory' feature set. That is selection/cut/copy/paste.

Inclusions will also be added.

### Identity and Authentication 

To support and isolate partner teams and the documents they create we will add an identity and authentication system to
routerlicious. This will enable identifying users of the system, authenticating their access to a document, as well as
providing partner teams with isolated document namespaces.

### Sessions

We will finish off the session feature set. This includes nacking clients and then supporting them in joining a session (i.e.
on first connection under heavy message traffic) as well as rejoining of a session.

### Blob support

We will need to support storing large data out of band of the normal message flow. This enables embedding GIFs, videos,
images, large blobs, etc... in the message stream without causing huge operation packets. This is similar to Git LFS.

### UI transparency

We make use of keyboard hotkeys for advanced editor features. But these are difficult to discover. We will update the UI with
either a ribbon or search box to make it easier to discover how to insert tables, lists, etc...

### Monitoring

We will continue to invest in our monitoring tools and features to make sure the entire system is up and running.

## API Tasks

Although not necessary for self hosting we will also look to advance features our our core API. This will include deploying
intelligent services as lambda at runtime. As well as simplifying how distributive data types are created.

## Entry Statistics

### Code Coverage

Branches
19.76%
978/4,950

Lines
23.73%
3,213/13,538
