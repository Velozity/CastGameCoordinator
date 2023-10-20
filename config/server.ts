import { createServer, IncomingMessage, ServerResponse } from "http";
import next from "next";
import { parse } from "url";

const port = 3000;
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

async function prepareServer(): Promise<any> {
  await app.prepare();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req, res, parse(req.url || "", true));
  });

  server.listen(port, (err?: any) => {
    if (err) throw err;
    console.log(
      `> Ready on http://localhost:${port} (${process.env.NODE_ENV})`
    );
  });

  return server;
}

export default prepareServer;
