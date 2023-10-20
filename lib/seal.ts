import { Account, GameServer } from "@prisma/client";
import { PublicAccountType, findAccount } from "./api/account";
import { sessionOptions } from "./config";
import { NextApiHandler } from "next";
import { seal, unseal, defaults } from "@hapi/iron";
import { getPropertyDescriptorForReqSession } from "@util/session";
import { getDaysToMs } from "@util/date";
import { IncomingMessage } from "http";
import prisma from "./prisma";
import logger from "./logger";

export async function getSession(
  req: IncomingMessage & {
    cookies: Partial<{
      [key: string]: string;
    }>;
  }
) {
  try {
    const session = await SealAuthenticator.validate(
      req.cookies[sessionOptions.cookieName] as string
    );

    return session;
  } catch {
    return {
      account: undefined,
      server: undefined,
    };
  }
}

export function withSessionRoute(handler: NextApiHandler): NextApiHandler {
  return async function nextApiHandlerWrappedWithSession(req, res) {
    const token =
      (req.cookies[sessionOptions.cookieName] as string) ||
      req.headers.authorization?.split("Bearer ")[1] ||
      "missing";

    try {
      const session = await SealAuthenticator.validate(token);
      req.session = {
        account: session,
      };

      Object.defineProperty(
        req.session,
        "session",
        getPropertyDescriptorForReqSession(session)
      );
    } catch (err: any) {
      if (err.message === "Error: isServer") {
        try {
          const decode: any = await unseal(token, sessionOptions.password, {
            ...defaults,
            ttl: 0,
          });
          req.session = {
            server: decode,
          };
        } catch (err) {
          console.log(err);
        }

        return handler(req, res);
      }

      req.session = {
        account: undefined,
      };
    }

    return handler(req, res);
  };
}

export class SealAuthenticator {
  public static async validate(token: string): Promise<PublicAccountType> {
    try {
      const decode: any = await unseal(
        token,
        sessionOptions.password,
        defaults
      );

      if (decode.server === true) throw new Error("isServer");

      const account = await findAccount({ id: decode.account.id });
      if (account == null) {
        throw new Error(`Account for id: ${decode.id} does not exist`);
      }

      return account as PublicAccountType;
    } catch (err: any) {
      throw new Error(err);
    }
  }

  public static async authenticate(account: Partial<Account>) {
    if (!account.id) throw new Error("Invalid account.");

    const token = await seal(
      {
        account: {
          id: account.id?.toString(),
          createdAt: account.createdAt,
        },
      },
      sessionOptions.password,
      {
        ...defaults,
        ttl: getDaysToMs(sessionOptions.expireDays),
      }
    );

    const refreshToken = await seal(
      {
        id: account.id?.toString(),
        isRefreshToken: true,
        createdAt: new Date(),
      },
      sessionOptions.password,
      defaults
    );

    return { token, refreshToken };
  }

  public static async refresh(token: string) {
    const payload: any = await unseal(token, sessionOptions.password, defaults);
    if (payload.isRefreshToken) {
      const account = await findAccount({ id: payload.id });
      if (account == null) {
        throw new Error(`Account for id: ${payload.id} does not exist`);
      }

      if (
        new Date(payload.createdAt).getTime() + getDaysToMs(31) <
        new Date().getTime()
      ) {
        throw new Error("Refresh token has expired, please relogin.");
      }

      return this.authenticate(account);
    }

    throw new Error("Invalid refresh token");
  }
}
