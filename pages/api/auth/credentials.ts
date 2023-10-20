import { NextApiRequest, NextApiResponse } from "next";
import logger from "@lib/logger";
import { validateAccount } from "@lib/api/account";
import { SealAuthenticator, withSessionRoute } from "@lib/seal";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;
  switch (method) {
    case "POST":
      try {
        const { username, password } = req.body;
        if (!username || !password) {
          console.log("bad struff");
          return res.json({
            error: "Invalid fields",
          });
        }

        const findAccount = await validateAccount({
          username: username as string,
          password: password as string,
        });
        if (!findAccount || !findAccount.success || findAccount.error) {
          return res.json({ error: findAccount?.error });
        }

        req.session.account = findAccount.account;
        const { token, refreshToken } = await SealAuthenticator.authenticate(
          findAccount.account
        );

        return res.json({
          success: true,
          authToken: token,
          refreshToken,
          account: findAccount.account,
        });
      } catch (error) {
        logger.error(error);
        res.json({ error: "An unexpected error occurred" });
      }
      break;
    default:
      res.setHeader("Allow", ["POST"]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default withSessionRoute(handler);
