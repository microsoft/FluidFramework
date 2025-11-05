# This script is used in the end-to-end real service tests to wait for Docker services to be ready.

set -eu -o pipefail

echo "Waiting for services to be ready..."

# Wait for each service endpoint with timeout
# Alfred (3003) and Historian (3001) use /healthz/startup
# Nexus (3002) uses /healthz/ping

echo "Waiting for localhost:3001 (historian)..."
timeout=30
while ! curl -sf "http://localhost:3001/healthz/startup" > /dev/null 2>&1; do
	if [ $timeout -le 0 ]; then
		echo "ERROR: Historian service failed to become ready"
		docker-compose -f $(Build.SourcesDirectory)/FluidFramework/server/docker-compose.yml logs historian
		exit 1
	fi
	echo "  Still waiting... ($timeout seconds remaining)"
	sleep 2
	timeout=$((timeout - 2))
done
echo "  ✓ Historian on port 3001 is ready"

echo "Waiting for localhost:3002 (nexus)..."
timeout=30
while ! curl -sf "http://localhost:3002/healthz/ping" > /dev/null 2>&1; do
	if [ $timeout -le 0 ]; then
		echo "ERROR: Nexus service failed to become ready"
		docker-compose -f $(Build.SourcesDirectory)/FluidFramework/server/docker-compose.yml logs nexus
		exit 1
	fi
	echo "  Still waiting... ($timeout seconds remaining)"
	sleep 2
	timeout=$((timeout - 2))
done
echo "  ✓ Nexus on port 3002 is ready"

echo "Waiting for localhost:3003 (alfred)..."
timeout=30
while ! curl -sf "http://localhost:3003/healthz/startup" > /dev/null 2>&1; do
	if [ $timeout -le 0 ]; then
		echo "ERROR: Alfred service failed to become ready"
		docker-compose -f $(Build.SourcesDirectory)/FluidFramework/server/docker-compose.yml logs alfred
		exit 1
	fi
	echo "  Still waiting... ($timeout seconds remaining)"
	sleep 2
	timeout=$((timeout - 2))
done
echo "  ✓ Alfred on port 3003 is ready"

echo "All services are ready!"
