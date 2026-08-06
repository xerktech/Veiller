import { Hono } from "hono";
import type { AuthVariables } from "@veiller/sdk";

import state from "./state.api";

const api = new Hono<{ Variables: AuthVariables }>();

api.route("/state", state);

export { api };
