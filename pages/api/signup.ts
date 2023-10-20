import { NextApiRequest, NextApiResponse } from "next";
import { createAccount } from "@/lib/api/account";
import logger from "../../lib/logger";
import argon2 from "argon2";
import { withSessionRoute } from "@/lib/seal";

async function post(req: NextApiRequest, res: NextApiResponse) {
  const { username, email, password, password2 } = req.body;
  if (!password || password.length < 8) {
    res.json({
      error: "Password must be atleast 8 characters.",
    });
    return;
  }

  if (password !== password2) {
    res.json({
      error: "Password must match.",
    });
    return;
  }

  if (!username || !email) {
    return res.json({
      error: "Bad username and email",
    });
  }

  const hash = await argon2.hash(password as string).catch((e) => e);

  if (!hash) {
    logger.error(hash);
    res.json({
      error: "An unknown error occurred.",
    });
    return;
  }

  const result = await createAccount({
    username: username as string,
    email: username as string,
    password: hash,
  }).catch((e) => e);
  if (result instanceof Error) {
    return res.json({
      error: "Please try again later.",
    });
  }

  return res.json({
    success: true,
    id: result.id,
  });
}

async function handler(req: any, res: any) {
  const { method } = req;

  switch (method) {
    case "POST":
      await post(req, res);
      return;
    default:
      res.setHeader("Allow", ["POST"]);
      res.status(405).send("Method not allowed");
  }
}

export default withSessionRoute(handler);
