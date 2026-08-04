# mcp-producthunt

Product Hunt MCP — wraps the Product Hunt GraphQL API v2 (api.producthunt.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `top_launches` | Get today's and recent top Product Hunt launches — new product and startup launches. Use this to see what launched today/recently or which products are trending. Returns name, tagline, vote/comment counts, URLs, and topics. Example: top_launches({ first: 10, order: "RANKING" }) |
| `get_post` | Get full details for a single Product Hunt launch by its slug — description, makers, topics, and vote/comment counts. Use after top_launches to dig into a specific new product / startup launch. Example: get_post({ slug: "notion" }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "producthunt": {
      "url": "https://gateway.pipeworx.io/producthunt/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Producthunt data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
