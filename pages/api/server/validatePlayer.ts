import { PublicAccountType, findAccount } from "@/lib/api/account";
import { Team } from "@/lib/config";
import prisma from "@/lib/prisma";
import { SealAuthenticator, withSessionRoute } from "@/lib/seal";
import { NextApiRequest, NextApiResponse } from "next";

async function POST(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!req.session?.server) {
      console.log("unauthorized server");
      res.status(401).end();
      return;
    }

    const { playerAuthToken, gameId } = req.body;
    if (!gameId || !playerAuthToken) {
      return res.json({
        success: false,
        error: "Bad input",
      });
    }

    let account: PublicAccountType;
    try {
      account = await SealAuthenticator.validate(playerAuthToken);
    } catch {
      return res.json({
        success: false,
        error: "Unauthorized",
      });
    }

    const game = await prisma.game.findFirst({
      where: {
        id: gameId,
        ongoing: true,
      },
      select: {
        TeamAPlayers: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rankedWins: true,
          },
        },
        TeamBPlayers: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rankedWins: true,
          },
        },
      },
    });

    if (!game) {
      return res.json({
        success: false,
        error: "Game not found",
      });
    }

    let player: any;
    let team: Team | undefined;
    if ((player = game.TeamAPlayers.find((p) => p.id === account?.id))) {
      team = Team.A;
    } else if ((player = game.TeamBPlayers.find((p) => p.id === account?.id))) {
      team = Team.B;
    }

    if (!player || team === undefined) {
      return res.json({
        success: false,
        error: "Not a player",
      });
    }

    player.team = team;
    console.log("validated player");
    return res.json({
      success: true,
      player,
    });
  } catch {
    res.status(401).end();
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case "POST":
      return await POST(req, res);
    default:
      return res.status(405).send("Method not allowed");
  }
}

export default withSessionRoute(handler);
