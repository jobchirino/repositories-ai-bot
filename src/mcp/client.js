import { listRepositories, getReadme, listRepositoriesTool, getReadmeTool } from './tools/github.js';

export const mcpTools = [
  {
    tool: listRepositoriesTool,
    execute: listRepositories,
  },
  {
    tool: getReadmeTool,
    execute: getReadme,
  },
];

export { listRepositories, getReadme };
