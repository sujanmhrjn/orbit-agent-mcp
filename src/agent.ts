import "dotenv/config";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { OpenAI } from "openai";

const apiKey = process.env.LITELLM_API_KEY;
const baseURL = process.env.LITELLM_BASE_URL;
const model = process.env.LITELLM_MODEL;

if (!apiKey || !baseURL || !model) {
  console.error(
    "Missing required environment variables. Please set LITELLM_API_KEY, LITELLM_BASE_URL, and LITELLM_MODEL.",
  );
  throw new Error(
    "Missing required environment variables. Please set LITELLM_API_KEY, LITELLM_BASE_URL, and LITELLM_MODEL.",
  );
}

const llm = new OpenAI({
  apiKey,
  baseURL,
});

const mcp = new Client({
  name: "Orbit Agent",
  version: "1.0.0",
  description: "An agent that uses LLMs to perform tasks and answer questions.",
});

/**
 * The client launches the MCP server and connects to the LLM for processing requests.
 */

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/mcp-server.ts"],
});

await mcp.connect(transport);

/*
 * Ask MCP server:
 *
 * "What tools do you have?"
 */

const { tools } = await mcp.listTools();

/*
 * Convert MCP tools into
 * OpenAI/LiteLLM tool definitions.
 */

const llmTools = tools.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ? tool.inputSchema : undefined,
  },
}));

/*
 * Read prompt from CLI.
 */
const userPrompt = process.argv.slice(2).join(" ").trim();

if (!userPrompt) {
  console.error('Usage: npm run ask -- "Create a task..."');

  await mcp.close();

  process.exit(1);
}

const messages: any[] = [
  {
    role: "system",

    content: `
You are Orbit, an AI workspace assistant.

You can manage tasks and notes using MCP tools.

Rules:

1. Use tools whenever the user requests an action.
2. Never claim an action happened unless the tool succeeded.
3. Search/list data when necessary before answering.
4. Do not invent task IDs.
5. Keep final answers concise.
`,
  },

  {
    role: "user",
    content: userPrompt,
  },
];

/*
 * Agent loop
 */
const MAX_STEPS = 8;
for (
  let step = 0;
  step < MAX_STEPS;
  step++
) {
  const response =
    await llm.chat.completions.create({
      model,

      messages,

      tools: llmTools,

      tool_choice: "auto",
    });

  const message =
    response.choices[0]?.message;

  if (!message) {
    throw new Error(
      "LiteLLM returned no message.",
    );
  }

  messages.push(message);

  /*
   * Model doesn't need a tool.
   * We have our answer.
   */

  if (
    !message.tool_calls ||
    message.tool_calls.length === 0
  ) {
    console.log(
      message.content ??
        "No response.",
    );

    break;
  }

  /*
   * Execute every MCP tool
   * requested by the model.
   */

  for (
    const toolCall of
    message.tool_calls
  ) {
    if (
      toolCall.type !== "function"
    ) {
      continue;
    }

    const toolName =
      toolCall.function.name;

    let args = {};

    try {
      args = JSON.parse(
        toolCall.function.arguments ||
          "{}",
      );
    } catch {
      args = {};
    }

    console.error(
      `Calling MCP tool: ${toolName}`,
    );

    /*
     * MCP executes the function.
     */

    const result =
      await mcp.callTool({
        name: toolName,
        arguments: args,
      });

    /*
     * Return tool result
     * back to the model.
     */

    messages.push({
      role: "tool",

      tool_call_id:
        toolCall.id,

      content: JSON.stringify(
        result.structuredContent ??
          result.content,
      ),
    });
  }
}

await mcp.close();