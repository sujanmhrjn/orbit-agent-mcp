import { McpServer, Server } from "@modelcontextprotocol/server";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import path from "node:path";
import crypto from "node:crypto";

import { z } from "zod";

const DATA_FILE = path.resolve("data/workspace.json");

type Priority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  completed: boolean;
}

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface WorkspaceData {
  tasks: Task[];
  notes: Note[];
}

async function readWorkspaceData(): Promise<WorkspaceData> {
  try {
    const data = await import(DATA_FILE);
    return data as WorkspaceData;
  } catch (error) {
    const workspace: WorkspaceData = {
      tasks: [],
      notes: [],
    };

    await writeWorkspace(workspace);

    return workspace;
  }
}

async function writeWorkspace(data: WorkspaceData): Promise<void> {
  const fs = await import("fs/promises");
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function createServer() {
  const server = new McpServer({
    name: "Orbit Workspace",
    version: "1.0.0",
    description: "A simple workspace for managing tasks and notes.",
  });

  /**
   * 1. Create Task
   */

  server.registerTool(
    "addTask",
    {
      description: "Add a new task to the workspace.",
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
      }),
    },
    async ({ title, description, priority }) => {
      const workspace = await readWorkspaceData();

      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        priority,
        description: description || "",
        completed: false,
      };
      workspace.tasks.push(newTask);
      await writeWorkspace(workspace);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(newTask),
          },
        ],
        structuredContent: newTask,
      };
    },
  );

  /**
   * 2. List Tasks
   */

  server.registerTool(
    "listTasks",
    {
      description: "List all tasks in the workspace.",
      inputSchema: z.object({
        status: z.enum(["all", "completed", "pending"]).default("all"),
      }),
    },
    async ({ status }) => {
      const workspace = await readWorkspaceData();
      let tasksToReturn: Task[];

      if (status === "completed") {
        tasksToReturn = workspace.tasks.filter((task) => task.completed);
      } else if (status === "pending") {
        tasksToReturn = workspace.tasks.filter((task) => !task.completed);
      } else {
        tasksToReturn = workspace.tasks;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tasksToReturn),
          },
        ],
        structuredContent: tasksToReturn,
      };
    },
  );

  /**
   * 3. Mark Task as Completed
   */
  server.registerTool(
    "completeTask",
    {
      description: "Mark a task as completed.",
      inputSchema: z.object({
        id: z.string().min(1),
      }),
    },
    async ({ id }) => {
      const workspace = await readWorkspaceData();
      const task = workspace.tasks.find((task) => task.id === id);
      if (!task) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Task with id ${id} not found.`,
            },
          ],
        };
      }
      task.completed = true;
      await writeWorkspace(workspace);
      return {
        content: [
          {
            type: "text",
            text: `Task with id ${id} marked as completed.`,
          },
        ],
        structuredContent: task,
      };
    },
  );


  /**
   * 4. Add Note
   */
  server.registerTool(
    "addNote",
    {
      description: "Add a new note to the workspace.",
      inputSchema: z.object({
        title: z.string().min(1),
        content: z.string().min(1),
      }),
    },
    async ({ title, content }) => {
      const workspace = await readWorkspaceData();
      
      const newNote: Note = {
        id: crypto.randomUUID(),
        title,
        content,
        createdAt: new Date().toISOString(),
      };
      workspace.notes.push(newNote);
      await writeWorkspace(workspace);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(newNote),
          },
        ],
        structuredContent: newNote,
      };
    },
  );

  /**
   * 5. Search Notes
   */
  server.registerTool(
    "searchNotes",
    {
      description: "Search for notes in the workspace.",
      inputSchema: z.object({
        query: z.string().min(1),
      }),
    },
    async ({ query }) => {
      const workspace = await readWorkspaceData();
      const notesToReturn = workspace.notes.filter((note) =>
        note.title.includes(query) || note.content.includes(query)
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(notesToReturn),
          },
        ],
        structuredContent: notesToReturn,
      };
    },
  );

  return server;
}


serveStdio(createServer)
console.error("Orbit MCP Server is running and listening for requests...");