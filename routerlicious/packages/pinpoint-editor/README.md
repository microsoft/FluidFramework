# Pinpoint Editor

Pinpoint Editor is a web app for quickly creating and editing [Pinpoint maps](https://github.com/dowjones/pinpoint).

**Features:**

- Simple user interface allows maps to be created in seconds.
- Flexible Angular app with Node backend.
- Built-in support for uploading JSON data files to Amazon S3.

## How to set up Pinpoint Editor

Pinpoint Editor requires:

- A node.js server
- A PostgresSQL database
- NPM and Bower for installing dependencies
- (optional) Amazon S3 to host data

Here's how to install it locally:

*Note: If you have trouble setting up Pinpoint Editor, please [open a ticket](https://github.com/dowjones/pinpoint-editor/issues/new) on GitHub.*

1. **Install required software**

    If on OS X, you can install all software using these commands:

        # Install Brew
        ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
    
        # Install NodeJS.
        brew install node

        # Install PostgreSQL.
        brew install postgresql

        # Install Bower.
        npm install bower

2. **Set up database**

    Create a PostgresSQL database. You can name it anything you like.

        createdb pinpointDb
    
    Set `DATABASE_URL` environment variable.
    
        export DATABASE_URL='postgresql://localhost/pinpointDb'
    
    Run migration script to set up table and load examples.

        psql $DATABASE_URL < build/migrate.sql

    You may need to start the database server manually:

        pg_ctl -D /usr/local/var/postgres -l /usr/local/var/postgres/server.log start

3. **Install dependencies**

        # Install server-side dependencies
        npm install
    
        # Install client-side dependencies
        bower install

4. **Configure settings**

    Generate a new Google Maps API key by [following these instructions](https://developers.google.com/maps/documentation/javascript/tutorial) and add it to `config.json` (under the `googleMapsAPIKey` property).
    
    *Optional:* To enable AWS S3 export, set these environment variables:

        export AWS_S3_KEY='XXXXXXXXXXXXXX'
        export AWS_S3_SECRET='XXXXXXXXXXXXXX'
        export AWS_BUCKET='XXXXXXXXXXXXXX'
    
5. **Run the server!**

        node server.js

    You will then be able to access Pinpoint at [http://localhost:3001](http://localhost:3001/).

## Docker setup

If you have Docker installed you can run the Pinpoint editor by simply typing `docker-compose up`. You can
then access Pinpoint at [http://localhost:3001](http://localhost:3001/).

## Architecture

On the server, Pinpoint uses the minimal Express framework for routing. Data is stored as JSON using [PostgresSQL's native JSON data type](http://schinckel.net/2014/05/25/querying-json-in-postgres/), which can then be accessed via a simple API (see below for details). Data can then be exported to S3-hosted static JSON for production use.

On the client, Pinpoint is an Angular app made up of multiple custom directives. Key files are `script.js` and `directives/map-detail.html`. Dependencies are managed using Bower.

### API routes

* Get all maps `GET - /api/maps`
* Get map by id `GET - /api/maps/:id`
* Create map `POST - /api/maps/`
	* http request header must be `Content-Type: application/json`
    * http request body contains the entire data object for that record
    * returns `HTTP/1.1 201 Created - {"id": id, "message": "Map created"}`
* Update map `PUT - /api/maps/:id`
	* http request header must be `Content-Type: application/json`
    * http request body contains the entire data object for that record
    * returns `HTTP/1.1 200 OK - {"message": "Map updated"}`
    
## Configuration file

Various settings are controlled via `config.json`. See `config-example.json` for dummy values.

**Editor interface options**

* googleMapsAPIKey: _(required)_ Google maps API key ([get one here](https://developers.google.com/maps/documentation/javascript/tutorial))
* title: Page title, e.g. _The Example Journal Map Tool_
* greeting: Message to go beneath page title. HTML is allowed.
* helpLink: URL of an external help page
* previewLink: URL which, with the current map's slug on the end, links to a preview
* liveLink: URL which, with the current map's slug on the end, links to the live production page for the current map
* s3url: URL which, with the current map's slug (and ".json") on the end, links to the S3-hosted static JSON
* geojsonStyles: Array
    * Object 
        * class: css class for style (string) - eg. "dashed-clockwise"
        * name: descriptive name for style (string) - eg. "Dashed, animated clockwise"

**Map setting options**

These are used in all Pinpoint instances in the editor.

* basemap: Leaflet tilelayer URL (string) - eg. "http://{s}.somedomain.com/blabla/{z}/{x}/{y}.png"
* basemapCredit: Credit line for tilelayer - eg. "Leaflet | © Mapbox | © OpenSteetMap contributors"


## Version history

**v1.2.1** (27 March, 2017)

- Bugfixes for editor interface

**v1.2.0** (17 February, 2017)

- New feature: basemap selection
- Google maps API key controlled via config.json
- Easier customisation of interface text via config.json
- Add pagination to homepage

**v1.1.0** (17 July, 2015)

- Update bower.json to allow any 1.1.* versions of Pinpoint library        
- Add .bowerrc to fix bower_components location
- Add helpful error message if server port is in use

**v1.0.1**

- Update bower.json to allow any 1.0.* versions of Pinpoint library        

**v1.0.0**

- Initial release        

