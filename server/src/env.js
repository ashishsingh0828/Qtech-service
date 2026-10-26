import "dotenv/config";
import { loadConfig } from "./config.js";

export const config = loadConfig(process.env);
