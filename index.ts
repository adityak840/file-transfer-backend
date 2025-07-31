import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import type { Express, Request, Response } from "express";

const connectedDevices: Map<string, { id: string; name?: string }> = new Map();

const app: Express = express();

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.get("/", (req: Request, res: Response) => {
  res.send("Backend server is running!");
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  connectedDevices.set(socket.id, {
    id: socket.id,
    name: `Device ${socket.id.slice(0, 4)}`,
  });
  io.emit("device-list", Array.from(connectedDevices.values()));

  socket.on("set-device-name", (name: string) => {
    const device = connectedDevices.get(socket.id);
    if (device && name) {
      device.name = name;
      connectedDevices.set(socket.id, device);
      io.emit("device-list", Array.from(connectedDevices.values()));
    }
  });

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
});

server.on("error", (err) => {
  console.error("HTTP server error:", err);
});

const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
