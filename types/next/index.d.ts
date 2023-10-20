import { ServerAuthObject } from "@/lib/config";
import { PublicAccountType } from "@lib/api/account";
import "next";

declare module "next" {
  interface NextApiRequest {
    session: {
      account?: PublicAccountType;
      server?: ServerAuthObject;
    };
  }
}
