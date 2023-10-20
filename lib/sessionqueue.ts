import { GameServer, Prisma, PrismaClient } from "@prisma/client";
import { GameType, Region, Team, gametypeConfig } from "./config";
import logger from "./logger";
import _ from "lodash";
import { coordinator } from "../config/websocket";
import redis from "./redis";
import { generateId } from "@/util/random";

const prisma = new PrismaClient();

type AddToQueueInput = {
  mainAccount: string; // Account ID
  region: Region; // Region from the enum
  gameType: GameType;
  partyMembers?: string[]; // Optional list of Account IDs
  onSessionCreated?: (session: {
    id: string;
    accountId: string;
    gameType: number;
    region: number;
    createdAt: Date;
  }) => void;
};

export async function createQueueSession(data: AddToQueueInput) {
  // Add the main account to the session queue with the specified region
  const session = await prisma.sessionQueue.upsert({
    where: { accountId: data.mainAccount },
    create: {
      accountId: data.mainAccount,
      region: data.region,
      gameType: data.gameType,
      Party:
        data.partyMembers && data.partyMembers.length > 0
          ? {
              create: {
                members: {
                  createMany: {
                    data: data.partyMembers.map((accountId) => {
                      return { accountId };
                    }),
                    skipDuplicates: true,
                  },
                },
              },
            }
          : undefined,
    },
    update: {
      accountId: data.mainAccount,
      region: data.region,
      gameType: data.gameType,
      Party:
        data.partyMembers && data.partyMembers.length > 0
          ? {
              create: {
                members: {
                  createMany: {
                    data: data.partyMembers.map((accountId) => {
                      return { accountId };
                    }),
                    skipDuplicates: true,
                  },
                },
              },
            }
          : undefined,
    },
  });

  logger.info(session, "Queue Session has been created.");
  if (data.onSessionCreated) {
    data.onSessionCreated(session);
  }

  checkAndStartGame(data.gameType, data.region); // TODO: game ranks range

  return session;
}

export async function terminateQueueSessionByAccountId(accountId: string) {
  try {
    const session = await prisma.sessionQueue.findFirst({
      where: {
        OR: [{ accountId }, { Party: { members: { some: { accountId } } } }],
      },
      include: {
        Party: {
          select: {
            members: {
              select: {
                accountId: true,
              },
            },
          },
        },
      },
    });

    if (session) {
      await prisma.sessionQueue.delete({
        where: {
          id: session.id,
        },
      });
      return session;
    }
  } catch (err) {
    logger.error(err, "Failed to terminate queue session by account id");
  }
}
type RemoveFromQueueInput = {
  queueSessionId: string;
};
export async function terminateQueueSession(data: RemoveFromQueueInput) {
  try {
    const session = await prisma.sessionQueue.delete({
      where: {
        id: data.queueSessionId,
      },
      include: {
        Party: {
          select: {
            members: {
              select: {
                accountId: true,
              },
            },
          },
        },
      },
    });

    logger.info(session, "Queue Session has been terminated.");
    return session;
  } catch (err) {
    console.log(err);
  }
}

async function checkAndStartGame(gameType: GameType, region: Region) {
  const totalSessionsInRegion = await prisma.sessionQueue.findMany({
    select: {
      id: true,
      accountId: true,
      Account: {
        select: {
          username: true,
          displayName: true,
        },
      },
      Party: {
        select: {
          members: {
            select: {
              accountId: true,
              Account: {
                select: {
                  username: true,
                  displayName: true,
                },
              },
            },
          },
        },
      },
    },
    where: { region: region, gameType },
    orderBy: { createdAt: "asc" },
  });

  const sessionsWithSizes = totalSessionsInRegion.map((session) => {
    return {
      ...session,
      size: 1 + (session.Party?.members?.length || 0),
    };
  });

  const playersNeeded = gametypeConfig[gameType].playersRequired;

  let teamASize = 0;
  let teamBSize = 0;

  const players: Array<{
    accountId: string;
    playerName: string;
    team: Team;
  }> = []; // This array will hold players with their team assignment
  let sessions: Array<string> = [];
  for (const session of sessionsWithSizes) {
    const playersFromSession = [
      {
        accountId: session.accountId,
        playerName: session.Account.displayName || session.Account.username,
      },
      ...(session.Party?.members.map((m) => {
        return {
          accountId: m.accountId,
          playerName: m.Account.displayName || m.Account.username,
        };
      }) || []),
    ];
    for (const player of playersFromSession) {
      if (teamASize < 5) {
        players.push({ ...player, team: Team.A });
        sessions.push(session.id);
        teamASize++;
      } else if (teamBSize < 5) {
        players.push({ ...player, team: Team.B });
        sessions.push(session.id);
        teamBSize++;
      }
    }
  }

  const totalPlayers = teamASize + teamBSize;

  if (totalPlayers >= playersNeeded) {
    logger.info(`Gonna Game, Region: ${region}`);
    // Find a server
    let foundServer: GameServer | undefined;
    let attemptTimer = 10000;
    for (let attempts = 0; attempts < 3; attempts++) {
      const gameServer = await prisma.gameServer
        .findFirst({
          where: {
            region,
            inUse: true, // TODO: change to false
          },
        })
        .catch((e) => {
          logger.error(e);
          return e;
        });
      logger.info({ gameServer });
      if (gameServer) {
        logger.info("found game server");
        const update = await prisma.gameServer.update({
          where: {
            id: gameServer.id,
          },
          data: {
            inUse: true,
          },
        });

        // server good to go
        foundServer = update;
        break;
      } else {
        await new Promise((r) => setTimeout(r, attemptTimer));
      }
    }

    if (foundServer === undefined) {
      for (let i = 0; i < sessions.length; i++) {
        coordinator.to(`queueSession.${sessions[i]}`).emit("gameSessionFound", {
          success: false,
          error: "There are no servers available.",
        });
      }
      return;
    }

    const randomId = generateId(6);
    const gameFoundKey = `gameFound.${foundServer.id}.${randomId}`;
    const setGameFound = await redis.set(
      gameFoundKey,
      JSON.stringify({
        gameType,
        region,
        players,
        playersNeeded,
        serverConnectionString: foundServer.connectionString,
        serverId: foundServer.id,
        sessions,
      }),
      { ex: 20 }
    );

    await redis.set(gameFoundKey + ".count", 0, {
      ex: 30,
    });

    if (setGameFound && foundServer) {
      sessions = _.uniq(sessions);
      console.log(`Game session found, confirming...`);
      logger.info({
        gameType,
        region,
        players,
        playersNeeded,
        serverConnectionString: foundServer.connectionString,
        serverId: foundServer.id,
        sessions,
      });
      for (let i = 0; i < sessions.length; i++) {
        coordinator.to(`queueSession.${sessions[i]}`).emit("gameSessionFound", {
          success: true,
          key: gameFoundKey,
        });
      }
    }

    // Clear the queue and party members for that region
    // You may need more detailed logic, but for brevity:
    // await prisma.partyMember.deleteMany({
    //   where: {
    //     Party: {
    //       SessionQueue: {
    //         region: region,
    //       },
    //     },
    //   },
    // });
    // await prisma.sessionQueue.deleteMany({
    //   where: { region: region },
    // });
    // await prisma.party.deleteMany({
    //   where: {
    //     SessionQueue: {
    //       region: region,
    //     },
    //   },
    // });
  } else {
    console.log(
      `Waiting for more players in region ${region}. Current count: ${totalPlayers}`
    );
  }
}
