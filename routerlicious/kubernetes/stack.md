Helm packages

We rely on the following helm packages to run our service

NAME               	REVISION	UPDATED                 	STATUS  	CHART           	NAMESPACE
alliterating-zebra 	1       	Fri Jun 16 01:24:45 2017	DEPLOYED	minio-0.1.2     	default
honest-toad        	3       	Fri Jun 16 14:52:49 2017	DEPLOYED	redis-0.7.0     	default
quelling-mastiff   	1       	Fri Jun 16 12:04:22 2017	DEPLOYED	grafana-0.3.6   	default
terrifying-eagle   	1       	Fri Jun 16 11:54:13 2017	DEPLOYED	prometheus-3.0.2	default
warped-clam        	1       	Fri Jun 16 16:02:34 2017	DEPLOYED	rabbitmq-0.5.3  	default
wintering-marsupial	3       	Fri Jun 16 18:12:23 2017	DEPLOYED	kafka-0.1.2     	default
yellow-pug         	1       	Fri Jun 16 01:23:09 2017	DEPLOYED	mongodb-0.4.11  	default

`helm install stable/prometheus`