import { Prisma } from "@prisma/client";
import logger from "../logger";
import prisma from "../prisma";
import argon2 from "argon2";

export type PublicAccountType = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  closed: boolean;
  createdAt: Date;
};
export async function findAccount(
  where: Prisma.AccountWhereUniqueInput
): Promise<PublicAccountType> {
  const account = await prisma.account.findUnique({
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      closed: true,
      createdAt: true,
    },
    where,
  });
  if (account instanceof Error || !account) {
    throw new Error("Account not found.");
  }

  return account;
}

type CreateAccountType = {
  username: string;
  email: string;
  password: string;
};
export async function createAccount({
  username,
  email,
  password,
}: CreateAccountType) {
  const account = await prisma.account
    .create({
      data: {
        username,
        email,
        password,
      },
    })
    .catch((e) => e);

  if (account instanceof Error) {
    throw new Error("Account failed to create");
  }

  return account ? true : false;
}

type ValidateAccountType = {
  username?: string;
  email?: string;
  password: string;
};
export async function validateAccount({
  username,
  password,
}: ValidateAccountType): Promise<
  | {
      success?: boolean;
      account?: any;
      error?: string;
    }
  | undefined
> {
  if (!username) {
    return {
      error: "Bad login",
    };
  }

  try {
    const findUser = await prisma.account.findFirst({
      where: {
        OR: [{ email: username }, { username }],
      },
    });
    if (!findUser) {
      return {
        error: "Account not found",
      };
    }

    try {
      if (!(await argon2.verify(findUser.password as string, password))) {
        return {
          error: "BAD_PASSWORD",
        };
      }
    } catch (err) {
      return {
        error: "Something went wrong, please try again soon.",
      };
    }

    return {
      success: true,
      account: findUser,
    };
  } catch (e) {
    logger.error("User validation failed");
    logger.error(e);
    return {
      error: "UNKNOWN_ERROR",
    };
  }
}
