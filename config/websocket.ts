import { parse } from "url";
import prepareServer from "./server";
import { Server as SocketIOServer } from "socket.io";
import { SealAuthenticator } from "@/lib/seal";

/** Initialize the socket.io server instance */
const io = new SocketIOServer();

// namespace for coordinator
const coordinator = io.of("/coordinator");

(async () => {
  const server = await prepareServer();

  // attach the socket.io instance to the server
  io.attach(server, {
    path: "/websocket",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization"],
    },
  });
})();

export { io, coordinator };
