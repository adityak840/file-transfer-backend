import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import type { Express, Request, Response } from "express";

// Maintain connected devices with IDs and optional names
const connectedDevices: Map<string, { id: string; name?: string }> = new Map();

const app: Express = express();

// Enable CORS for local frontend
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Create HTTP server and wrap with socket.io
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 5e6, // 5 MB to allow large chunks
});

// Health check endpoint
app.get("/", (req: Request, res: Response) => {
  res.send("Backend server is running!");
});

// Main socket.io connection handler
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Register device
  connectedDevices.set(socket.id, {
    id: socket.id,
    name: `Device ${socket.id.slice(0, 4)}`,
  });

  // Broadcast updated device list
  io.emit("device-list", Array.from(connectedDevices.values()));

  // Handle device naming
  socket.on("set-device-name", (name: string) => {
    const device = connectedDevices.get(socket.id);
    if (device && name) {
      device.name = name;
      connectedDevices.set(socket.id, device);
      io.emit("device-list", Array.from(connectedDevices.values()));
    }
  });

  // Leave on disconnect
  socket.on("disconnect", (reason: string) => {
    console.log("User disconnected:", socket.id, "| Reason:", reason);
    connectedDevices.delete(socket.id);
    io.emit("device-list", Array.from(connectedDevices.values()));
  });

  socket.on("error", (err: Error) => {
    console.error("Socket error:", err);
    connectedDevices.delete(socket.id);
    io.emit("device-list", Array.from(connectedDevices.values()));
  });

  // Join personal room for receiving files
  socket.on("join-receive-room", () => {
    socket.join(socket.id);
    console.log(`Socket ${socket.id} joined receive room: ${socket.id}`);
  });

  // Notify recipient of incoming file
  socket.on(
    "start-transfer",
    ({
      targetId,
      fileName,
      fileSize,
    }: {
      targetId: string;
      fileName: string;
      fileSize: number;
    }) => {
      console.log(`Starting transfer to ${targetId}:`, fileName, fileSize);
      io.to(targetId).emit("incoming-transfer", {
        senderId: socket.id,
        fileName,
        fileSize,
      });
    }
  );

  // Handle file chunk transfer
  socket.on(
    "file-chunk",
    (
      {
        targetId,
        chunk,
        index,
        totalChunks,
      }: {
        targetId: string;
        chunk: Buffer;
        index: number;
        totalChunks: number;
      },
      ack: () => void
    ) => {
      if (!Buffer.isBuffer(chunk)) {
        console.warn("Invalid chunk received");
        return;
      }

      io.to(targetId).emit("receive-chunk", {
        chunk,
        index,
        totalChunks,
      });

      if (typeof ack === "function") {
        ack(); // confirm receipt for sender to proceed
      }
    }
  );

  // Notify recipient that transfer is complete
  socket.on("transfer-complete", ({ targetId }: { targetId: string }) => {
    console.log(`Transfer to ${targetId} completed.`);
    io.to(targetId).emit("transfer-complete");
  });
});

// Catch server-level errors
server.on("error", (err) => {
  console.error("HTTP server error:", err);
});

// Start server
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
