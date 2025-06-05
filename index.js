const express = require("express");
const httpProxy = require("http-proxy-middleware");
const Docker = require("dockerode");

const managementApp = express(); 
const proxyApp = express();    

const docker = new Docker({
  socketPath: "/var/run/docker.sock"
});

let containerMap = new Map();


async function updateRoutes() {
  console.log("🔄 Updating container routes...");
  
  try {
    const containers = await docker.listContainers({ all: false });
    const newContainerMap = new Map();

    for (const containerInfo of containers) {
      const name = containerInfo.Names[0].replace("/", "");
      
      try {
        const containerDetails = await docker.getContainer(containerInfo.Id).inspect();
        const networks = containerDetails.NetworkSettings.Networks;
        
        // Get IP from any available network (prefer bridge)
        let ip = containerDetails.NetworkSettings.IPAddress;
        if (!ip && networks) {
          const networkNames = Object.keys(networks);
          for (const networkName of networkNames) {
            if (networks[networkName].IPAddress) {
              ip = networks[networkName].IPAddress;
              break;
            }
          }
        }

        if (!ip) {
          console.warn(`⚠️  No IP found for container: ${name}`);
          continue;
        }

        const exposedPorts = containerDetails.Config.ExposedPorts || {};
        const port = Object.keys(exposedPorts)[0]?.split("/")[0] || "80";

        newContainerMap.set(name, { name, ip, port });
        console.log(`✅ [ROUTE] ${name}.localhost -> http://${ip}:${port}`);
      } catch (inspectErr) {
        console.error(`❌ Error inspecting container ${name}:`, inspectErr.message);
      }
    }

    containerMap = newContainerMap;
    console.log(`📊 Total active routes: ${containerMap.size}`);
  } catch (err) {
    console.error("❌ Error updating routes:", err.message);
  }
}


managementApp.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeRoutes: Array.from(containerMap.values())
  });
});

managementApp.get("/routes", (req, res) => {
  res.json({
    routes: Array.from(containerMap.values()).map(c => ({
      hostname: `${c.name}.localhost`,
      target: `http://${c.ip}:${c.port}`
    }))
  });
});

proxyApp.use((req, res, next) => {
  const host = req.headers.host?.split(":")[0];
  
  if (!host) {
    return res.status(400).json({ error: "No host header provided" });
  }
  const containerName = host.replace(".localhost", "");
  const containerInfo = containerMap.get(containerName);
  
  if (!containerInfo) {
    console.warn(`⚠️  No route found for: ${host}`);
    return res.status(502).json({ 
      error: `No container mapped for hostname: ${host}`,
      availableRoutes: Array.from(containerMap.keys()).map(name => `${name}.localhost`)
    });
  }

  const target = `http://${containerInfo.ip}:${containerInfo.port}`;
  console.log(`🔀 Proxying ${host} -> ${target}`);


  const proxyMiddleware = httpProxy.createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: 30000,
    proxyTimeout: 30000,
    onError: (err, req, res) => {
      console.error(`❌ Proxy error for ${host}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Proxy error",
          target,
          message: err.message
        });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`📤 Proxying ${req.method} ${req.url} to ${target}`);
    }
  });

  proxyMiddleware(req, res, next);
});


const errorHandler = (err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};

managementApp.use(errorHandler);
proxyApp.use(errorHandler);

let eventStream = null;
function setupDockerEventListener() {
  docker.getEvents({ since: Math.floor(Date.now() / 1000) }, (err, stream) => {
    if (err) {
      console.error("❌ Docker event stream error:", err);
      setTimeout(setupDockerEventListener, 5000);
      return;
    }

    eventStream = stream;
    console.log("👂 Docker event listener started");

    stream.on("data", async (chunk) => {
      try {
        const event = JSON.parse(chunk.toString());
        if (event.Type === "container" && 
            (event.Action === "start" || event.Action === "stop" || event.Action === "die")) {
          console.log(`🐳 Container ${event.Action}: ${event.Actor?.Attributes?.name || event.id}`);
          await updateRoutes();
        }
      } catch (parseErr) {
        console.error("❌ Error parsing Docker event:", parseErr.message);
      }
    });

    stream.on("error", (streamErr) => {
      console.error("❌ Docker event stream error:", streamErr.message);
      setTimeout(setupDockerEventListener, 5000);
    });

    stream.on("end", () => {
      console.log("⚠️  Docker event stream ended, restarting...");
      setTimeout(setupDockerEventListener, 1000);
    });
  });
}

const gracefulShutdown = (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully`);
  if (eventStream) {
    eventStream.destroy();
  }
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));


async function init() {
  console.log("🚀 Starting Docker Proxy Server...");
  
  try {

    await docker.ping();
    console.log("✅ Docker connection successful");
    
    // Initial route setup
    await updateRoutes();
    // Start event listener
    setupDockerEventListener();
    const MANAGEMENT_PORT = process.env.MANAGEMENT_PORT || 8080;
    managementApp.listen(MANAGEMENT_PORT, "0.0.0.0", () => {
      console.log(`🔧 Management Server listening on port ${MANAGEMENT_PORT}`);
      console.log(`📊 Health check: http://localhost:${MANAGEMENT_PORT}/health`);
      console.log(`📋 Routes list: http://localhost:${MANAGEMENT_PORT}/routes`);
    });

    // Start Proxy Server (Port 80)
    const PROXY_PORT = process.env.PROXY_PORT || 80;
    proxyApp.listen(PROXY_PORT, "0.0.0.0", () => {
      console.log(`🌐 Proxy Server listening on port ${PROXY_PORT}`);
      console.log(`🔀 Proxying requests for *.localhost domains`);
    });

  } catch (err) {
    console.error("❌ Failed to initialize:", err.message);
    process.exit(1);
  }
}

init();