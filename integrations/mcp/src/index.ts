import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { readConfiguration, WorkspaceReader } from './workspace.js';

async function main() {
  const server = createServer(new WorkspaceReader(readConfiguration(process.env)));
  process.once('SIGINT', () => { void server.close(); });
  process.once('SIGTERM', () => { void server.close(); });
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  process.stderr.write('M&C MCP could not start. Check the workspace URL, current owner session and local client configuration.\n');
  process.exitCode = 1;
});
