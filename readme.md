# Proxify

Proxify is a lightweight reverse proxy that automatically routes *.localhost domains to running Docker containers based on their names (e.g., nginx.localhost → nginx container IP).

It solves the problem of manually managing port mappings and remembering random ports when developing with multiple Docker containers - instead of accessing localhost:3001, localhost:8080, etc., we can use intuitive domain names that automatically update as containers start/stop.

![image](https://github.com/user-attachments/assets/3973378b-ea63-46c1-92d3-3010cbb17415)

## Features

- 🔄 **Auto-discovery**: Automatically detects running Docker containers
- 🌐 **Domain routing**: Routes `containername.localhost` to container IP addresses
- 📊 **Management API**: Health checks and route inspection endpoints
- 🔧 **Real-time updates**: Listens to Docker events for instant route updates
- 🛡️ **Error handling**: Graceful error handling and recovery
- 📋 **Logging**: Comprehensive logging with emojis for easy debugging

## How It Works

The service runs two Express servers:
- **Port 8080**: Management endpoints (`/health`, `/routes`)
- **Port 80**: Proxy server for `*.localhost` domains

When you access `myapp.localhost`, the proxy:
1. Extracts the container name (`myapp`)
2. Looks up the container's IP address
3. Forwards the request to `http://container-ip:port`

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Node.js (if running locally)

### Using Docker Compose (Recommended)

1. **Clone and setup:**
```bash
git clone https://github.com/Sahiiil1406/proxify
cd proxify
```

2. **Start the service:**
```bash
docker-compose up -d
```

3. **Verify it's running:**
```bash
curl http://localhost:8080/health
```

## Usage Examples
### Start some containers
```bash
# Start an nginx container
docker run -d --name nginx nginx:alpine

# Start a web app container
docker run -d --name webapp node:alpine

# Start an API server
docker run -d --name api-server express:latest
```

### Access containers via localhost
- `http://nginx.localhost` → Routes to nginx container
- `http://webapp.localhost` → Routes to webapp container  
- `http://api-server.localhost` → Routes to api-server container

### Management Endpoints

**Health Check:**
```bash
curl http://localhost:8080/health
```
Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-06T10:30:00.000Z",
  "activeRoutes": [
    {"name": "nginx", "ip": "172.17.0.2", "port": "80"},
    {"name": "webapp", "ip": "172.17.0.3", "port": "3000"}
  ]
}
```

**List Routes:**
```bash
curl http://localhost:8080/routes
```
Response:
```json
{
  "routes": [
    {"hostname": "nginx.localhost", "target": "http://172.17.0.2:80"},
    {"hostname": "webapp.localhost", "target": "http://172.17.0.3:3000"}
  ]
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MANAGEMENT_PORT` | 8080 | Port for management endpoints |
| `PROXY_PORT` | 80 | Port for proxy server |


## Screenshots
![image](https://github.com/user-attachments/assets/3973378b-ea63-46c1-92d3-3010cbb17415)

![image](https://github.com/user-attachments/assets/69c3d758-aae5-4684-8a43-92f3a2e41b1f)

![image](https://github.com/user-attachments/assets/68e2cacb-b014-4db1-ba43-672e17934ae1)



