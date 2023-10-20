/* eslint-disable camelcase */
import _ from "lodash";
import { coordinator, io } from "../config/websocket";
import WebSocket from "ws";
import { SealAuthenticator } from "../lib/seal";
import { IncomingMessage } from "http";
import { PublicAccountType } from "../lib/api/account";
import {
  createQueueSession,
  terminateQueueSession,
  terminateQueueSessionByAccountId,
} from "@/lib/sessionqueue";
import logger from "@/lib/logger";
import redis from "@/lib/redis";
import prisma from "@/lib/prisma";
import { GameType, Region, Team, sessionOptions } from "@/lib/config";
import { defaults, unseal } from "@hapi/iron";

coordinator.on("connection", async (socket) => {
  const authToken =
    socket.request.headers.authorization?.split("Bearer ")[1] || "missing";
  try {
    const accountValidation = await SealAuthenticator.validate(authToken);

    socket.data.account = accountValidation;
  } catch (err: any) {
    if (err.message === "Error: isServer") {
      try {
        const decode: any = await unseal(authToken, sessionOptions.password, {
          ...defaults,
          ttl: 0,
        });

        const server = await prisma.gameServer
          .findUnique({
            where: {
              id: decode.id,
            },
          })
          .catch((e) => e);
        if (!server) {
          socket.emit("error", {
            code: 3000,
            error: "Unauthorized",
          });
          socket.disconnect(true);
          return;
        }

        socket.data.server = server;
      } catch {
        socket.emit("error", {
          code: 3000,
          error: "Unauthorized",
        });
        socket.disconnect(true);
        return;
      }
    } else {
      socket.emit("error", {
        code: 3000,
        error: "Unauthorized",
      });
      socket.disconnect(true);
      return;
    }
  }

  // Is user connected to game coordinator on another device?
  coordinator.once("deviceCheck", (data) => {
    socket.emit("error", {
      code: 1000,
      error: "Multiple devices connected to coordinator",
    });
    console.log("multiple device detected");
    socket.disconnect(true);
  });
  coordinator
    .in(
      `player.${
        socket.data.account ? socket.data.account.id : socket.data.server.id
      }`
    )
    .emit("deviceCheck", 1);

  // Authenticated
  if (socket.data.account) {
    socket.join(`player.${socket.data.account.id}`);
  } else if (socket.data.server) {
    socket.join(`server.${socket.data.server.id}`);
    console.log(`server.${socket.data.server.id}`);

    prisma.gameServer
      .update({
        where: {
          id: socket.data.server.id,
        },
        data: {
          ready: true,
        },
      })
      .catch((e) => logger.error(e));
  }
  console.log(
    `WS /coordinator connected: ${
      socket.data.account
        ? JSON.stringify(socket.data.account)
        : "SERVER: " + JSON.stringify(socket.data.server)
    }`
  );

  socket.conn.on("close", async () => {
    console.log("WS /coordinator disconnected");

    try {
      socket.leave(
        socket.data.account
          ? `player.${socket.data.account.id}`
          : `server.${socket.data.server.id}`
      );
      // HANDLE PARTY MEMBER DISCONNECTS IN THE GAME REPLICATION
      if (socket.data.account) {
        const session = await terminateQueueSessionByAccountId(
          socket.data.account?.id
        );
        if (session) {
          coordinator
            .in(`players.${session.accountId}`)
            .emit(`leaveSession`, session.id);
          if (session.Party && session.Party.members.length > 0) {
            for (let i = 0; i < session.Party.members.length; i++) {
              coordinator
                .in(`players.${session.Party.members[i].accountId}`)
                .emit("joinSession", session.id);
            }
          }

          logger.info(session, "Terminated queue session after idle");
        }
      }

      if (socket.data.server) {
        prisma.gameServer
          .update({
            where: {
              id: socket.data.server.id,
            },
            data: {
              ready: false,
            },
          })
          .catch((e) => logger.error(e));
      }
    } catch (err) {
      logger.error(err, "Failed disconnect");
    }
  });

  socket.conn.on("error", async (err: Error) => {
    console.log(err);
  });

  socket.on("joinSession", async (sessionId: string) => {
    socket.join(`queueSession.${sessionId}`);
  });

  socket.on("leaveSession", async (sessionId: string) => {
    socket.leave(`queueSession.${sessionId}`);
  });

  socket.on("beginGameSessionSearch", async (data: any) => {
    if (socket.data.server) return;
    if (data.region === undefined || data.gameType === undefined) {
      socket.emit("gameSessionSearchResult", {
        success: false,
        error: "Invalid search parameters.",
      });
      return;
    }

    try {
      const session = await createQueueSession({
        mainAccount: socket.data.account.id,
        region: data.region,
        gameType: data.gameType,
        onSessionCreated: (session) => {
          if (data.partyMembers?.length > 0) {
            for (let i = 0; i < data.partyMembers; i++) {
              coordinator
                .in(`players.${data.partyMembers[i]}`)
                .emit("joinSession", session.id);
            }
          }

          socket.join(`queueSession.${session.id}`);
          socket.emit("gameSessionSearchResult", {
            success: true,
            queueId: session.id,
            createdAt: session.createdAt,
          });
        },
      }); // TO DO: PARTY MEMBERS

      // data.partyMembers
    } catch (err) {
      logger.error(err, "Failed to create queue session");
      socket.emit("gameSessionSearchResult", {
        success: false,
        error: "Failed to queue matchmaking.",
      });
    }
    return;
  });

  socket.on("gameReadyUp", async (data: any) => {
    if (socket.data.server) return;
    try {
      const { key, timestamp } = data;

      const gameData: any = await redis.get(key);
      if (!gameData) return;

      const {
        gameType,
        region,
        players,
        playersNeeded,
        serverConnectionString,
        serverId,
        sessions,
      }: {
        gameType: GameType;
        region: Region;
        players: Array<{
          accountId: string;
          playerName: string;
          team: Team;
        }>;
        playersNeeded: number;
        serverConnectionString: string;
        serverId: number;
        sessions: Array<string>;
      } = gameData;

      if (new Date(timestamp) > new Date(new Date().getTime() - 30000)) {
        const newCount = await redis.incr(key + ".count"); // TODO FIX
        console.log(
          `(${newCount}/${playersNeeded}) Player joined ${socket.data.account.id}`
        );
        if (newCount >= playersNeeded) {
          logger.info(`Game confirmed, ready!`);

          const game = await prisma.game
            .create({
              data: {
                gameType,
                gameServerId: serverId,
                TeamAPlayers: {
                  connect: players
                    .filter((p) => p.team === Team.A)
                    .map((p) => {
                      return {
                        id: p.accountId,
                      };
                    }),
                },
                TeamBPlayers: {
                  connect: players
                    .filter((p) => p.team === Team.B)
                    .map((p) => {
                      return {
                        id: p.accountId,
                      };
                    }),
                },
              },
            })
            .catch((e) => {
              logger.error(e, "Failed to create game!");
              return e;
            });

          if (!game) {
            return;
          }

          for (let i = 0; i < sessions.length; i++) {
            coordinator
              .to(`queueSession.${sessions[i]}`)
              .socketsJoin(`game.${game.id}`);
          }

          for (let i = 0; i < sessions.length; i++) {
            coordinator.socketsLeave(`queueSession.${sessions[i]}`);
          }

          prisma.sessionQueue
            .deleteMany({
              where: {
                OR: sessions.map((id) => {
                  return { id };
                }),
              },
            })
            .catch((e) => logger.error(e));

          const gameData = {
            timestamp: game.createdAt.getTime().toString(),
            connectionString: serverConnectionString,
            region,
            gameType,
            gameId: game.id,
            players,
          };

          // alert server
          coordinator.to(`server.${serverId}`).emit("gameReady", {
            success: true,
            data: gameData,
          });

          // alert players
          coordinator.to(`game.${game.id}`).emit("gameReady", {
            success: true,
            data: gameData,
          });
        }
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("terminateGameSessionSearch", async (data: any) => {
    try {
      if (!data.queueSessionId) return;

      const session = await terminateQueueSession({
        queueSessionId: data.queueSessionId,
      });

      if (session) {
        coordinator
          .in(`players.${session.accountId}`)
          .emit(`leaveSession`, session.id);
        if (session.Party && session.Party.members.length > 0) {
          for (let i = 0; i < session.Party.members.length; i++) {
            coordinator
              .in(`players.${session.Party.members[i].accountId}`)
              .emit("joinSession", session.id);
          }
        }
      }
    } catch (err) {
      logger.error(err, "Failed to terminate queue session");
    }
  });
});
