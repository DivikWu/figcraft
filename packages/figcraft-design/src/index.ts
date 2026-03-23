import { runMcpServer } from '@figcraft/core-mcp';

runMcpServer().catch((err) => {
  console.error('[figcraft-design] Fatal:', err);
  process.exit(1);
});
