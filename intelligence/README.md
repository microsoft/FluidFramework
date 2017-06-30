# Intelligence

Intelligence exposes python machine learning libaries via REST API implemented using Python Flask server. For proof of concept, we are using python [TextBlob](http://textblob.readthedocs.io/en/dev/quickstart.html) library to do simple sentiment analysis. This service is easily extendible to other ml libraries.


## Building and Running

Docker Compose is used to run the service locally. To start up an instance of the service simply run the following two commands.

* `docker-compose build`
* `docker-compose up`