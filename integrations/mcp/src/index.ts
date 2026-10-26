import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { OwnerAccess, readConfiguration, WorkspaceReader } from './workspace.js';

import { SetupPreparer } from './preparation.js';
import { ServiceInformation } from './service-information.js';

async function main() {
  const config = readConfiguration(process.env);
  const preparer = process.env.MC_MCP_ALLOW_SETUP_PREPARATION === '1' ? new SetupPreparer(new OwnerAccess(config)) : undefined;
  const information = process.env.MC_MCP_ALLOW_SERVICE_INFORMATION === '1' ? new ServiceInformation(new OwnerAccess(config)) : undefined;
  const server = createServer(new WorkspaceReader(config), preparer, information);
  process.once('SIGINT', () => { void server.close(); });
  process.once('SIGTERM', () => { void server.close(); });
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  process.stderr.write('M&C MCP could not start. Check the workspace URL, current owner session and local client configuration.\n');
  process.exitCode = 1;
});
