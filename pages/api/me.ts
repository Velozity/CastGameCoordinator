import { findAccount } from "@/lib/api/account";
import { withSessionRoute } from "@/lib/seal";
import { NextApiRequest, NextApiResponse } from "next";

async function GET(req: NextApiRequest, res: NextApiResponse) {
  console.log("accessed /me");
  try {
    if (!req.session?.account) {
      console.log("unauthorized");
      res.status(401).end();
      return;
    }

    const account = await findAccount({ id: req.session?.account?.id });
    return res.json({
      success: true,
      account,
    });
  } catch {
    res.status(401).end();
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case "GET":
      return await GET(req, res);
    default:
      return res.status(405).send("Method not allowed");
  }
}

export default withSessionRoute(handler);
