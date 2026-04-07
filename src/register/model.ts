import { createOllama } from "ollama-ai-provider-v2";

const ollama = createOllama({
  // optional settings, e.g.
  baseURL: process.env?.LOCAL_MODEL_BASE_URL ?? "http://localhost:11434/api",
});

const model = ollama(process.env?.LOCAL_MODEL_SIGNAL ?? "");

export default model;