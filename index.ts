/// <reference path="./types/next/index.d.ts" />

import "./config/websocket";

setTimeout(() => {
  import("./ws");
}, 2000);
