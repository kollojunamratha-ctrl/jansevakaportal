const path = require("path");
const cors = require("cors");
const express = require("express");
const dotenv = require("dotenv");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const schemeRoutes = require("./routes/schemes");
const translateRoutes = require("./routes/translate");
const { initializeRepository } = require("./services/schemeRepository");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;


app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (_req, res) => {
  const stats = await initializeRepository();
  res.json({
    status: "ok",
    storage: stats.storage,
    totalSchemes: stats.count,
    syncedAt: stats.syncedAt
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

app.use("/api/schemes", schemeRoutes);
app.use("/api", translateRoutes);
app.use("/api", authRoutes);
app.use("/api", profileRoutes);
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/data", express.static(path.join(__dirname, "..", "data")));

app.get("/scheme/:id", (req, res) => {
  const params = new URLSearchParams({
    id: req.params.id
  });

  if (req.query.lang) {
    params.set("lang", req.query.lang);
  }

  if (req.query.state) {
    params.set("state", req.query.state);
  }

  if (req.query.category) {
    params.set("category", req.query.category);
  }

  res.redirect(`/scheme-details.html?${params.toString()}`);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);

    const handleListening = () => {
      cleanup();
      resolve(server);
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      server.off("listening", handleListening);
      server.off("error", handleError);
    };

    server.once("listening", handleListening);
    server.once("error", handleError);
  });
}

async function initializeRepositorySafely() {
  try {
    const stats = await initializeRepository();
    console.log(`Repository: ${stats.storage} | Schemes: ${stats.count}`);
  } catch (error) {
    console.error(`JanSevak started, but repository initialization failed: ${error.message}`);
  }
}

async function startServer() {
  const fallbackPorts = process.env.PORT ? [0] : [PORT + 1, 0];
  const portsToTry = [PORT, ...fallbackPorts];
  let lastError;

  for (const candidatePort of portsToTry) {
    try {
      const server = await listenOnPort(candidatePort);
      const address = server.address();
      const activePort =
        typeof address === "object" && address !== null ? address.port : candidatePort;

      if (activePort !== PORT) {
        console.warn(
          `Port ${PORT} was busy, so JanSevak switched to port ${activePort}.`
        );
      }

      console.log(`JanSevak running on port ${activePort}`);

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(`Port conflict detected on port ${activePort}: ${error.message}`);
          return;
        }

        console.error(`Server error: ${error.message}`);
      });

      await initializeRepositorySafely();
      return server;
    } catch (error) {
      lastError = error;

      if (error.code !== "EADDRINUSE") {
        throw error;
      }

      const nextPort = candidatePort === 0 ? "a random available port" : `port ${candidatePort}`;
      console.warn(`${nextPort} is already in use. Trying another port...`);
    }
  }

  throw lastError || new Error("Unable to start the server.");
}

startServer().catch((error) => {
  console.error(`JanSevak could not start: ${error.message}`);
  process.exitCode = 1;
});
