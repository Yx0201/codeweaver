import { createOllama } from "ollama-ai-provider-v2";

const ollama = createOllama({
  // optional settings, e.g.
  baseURL: process.env?.LOCAL_MODEL_BASE_URL ?? "http://localhost:11434/api",
});

export const titleModel = ollama(
  process.env?.LOCAL_TITLE_MODEL_SIGNAL ?? process.env?.LOCAL_MODEL_SIGNAL ?? ""
);
export const chatModel = ollama(
  process.env?.LOCAL_CHAT_MODEL_SIGNAL ?? process.env?.LOCAL_MODEL_SIGNAL ?? ""
);

export default titleModel;
