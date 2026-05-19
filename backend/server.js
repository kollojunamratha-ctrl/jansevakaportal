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
const PORT = process.env.PORT || 5000;

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function getAllowedOrigins() {
  const localOrigins =
    process.env.NODE_ENV === "production"
      ? []
      : [
          "http://localhost:3000",
          "http://localhost:5000",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:5000"
        ];

  return [
    ...localOrigins,
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    process.env.JANSEVAK_CORS_ORIGINS
  ]
    .filter(Boolean)
    .flatMap((entry) => String(entry).split(","))
    .map(normalizeOrigin)
    .filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();
const deploymentOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/[a-z0-9-]+\.onrender\.com$/i
];

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);

  return (
    allowedOrigins.includes(normalizedOrigin) ||
    deploymentOriginPatterns.some((pattern) => pattern.test(normalizedOrigin))
  );
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});
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

app.use((error, _req, res, _next) => {
  console.error(`Request failed: ${error.message}`);
  res.status(error.status || 500).json({
    error: "Server error",
    details: process.env.NODE_ENV === "production" ? undefined : error.message
  });
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
  const basePort = Number(PORT);
  const portsToTry = process.env.PORT ? [basePort] : [basePort, basePort + 1, 0];
  let lastError;

  for (const candidatePort of portsToTry) {
    try {
      const server = await listenOnPort(candidatePort);
      const address = server.address();
      const activePort =
        typeof address === "object" && address !== null ? address.port : candidatePort;

      if (activePort !== basePort) {
        console.warn(
          `Port ${basePort} was busy, so JanSevak switched to port ${activePort}.`
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

      if (process.env.PORT) {
        throw error;
      }

      const nextPort = candidatePort === 0 ? "a random available port" : `port ${candidatePort}`;
      console.warn(`${nextPort} is already in use. Trying another port...`);
    }
  }

  throw lastError || new Error("Unable to start the server.");
}

if (require.main === module) {
  process.on("unhandledRejection", (error) => {
    console.error(`Unhandled rejection: ${error?.message || error}`);
  });

  process.on("uncaughtException", (error) => {
    console.error(`Uncaught exception: ${error.message}`);
    process.exitCode = 1;
  });

  startServer().catch((error) => {
    console.error(`JanSevak could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.startServer = startServer;
