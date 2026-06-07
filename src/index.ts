interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Product Hunt MCP — wraps the Product Hunt GraphQL API v2 (api.producthunt.com)
 *
 * Surfaces daily product / startup launches: what launched today or recently,
 * trending products, and full details for any individual launch.
 *
 * Tools:
 * - top_launches: today's / recent top Product Hunt launches (ranking, votes, newest)
 * - get_post: full details for a single launch by its Product Hunt slug
 *
 * Dual key model: pass your own Product Hunt developer token via _apiKey for
 * higher limits, or omit it to use the shared Pipeworx key.
 */


const GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql';

const tools: McpToolExport['tools'] = [
  {
    name: 'top_launches',
    description:
      'Get today\'s and recent top Product Hunt launches — new product and startup launches. Use this to see what launched today/recently or which products are trending. Returns name, tagline, vote/comment counts, URLs, and topics. Example: top_launches({ first: 10, order: "RANKING" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        first: {
          type: 'number',
          description: 'Number of launches to return (default 10, max 20)',
        },
        order: {
          type: 'string',
          description:
            'Sort order: "RANKING" (default — trending), "VOTES" (most upvoted), or "NEWEST" (most recently launched)',
          enum: ['RANKING', 'VOTES', 'NEWEST'],
        },
        _apiKey: {
          type: 'string',
          description:
            'Optional — your own Product Hunt developer token for higher limits; omit to use the shared Pipeworx key.',
        },
      },
    },
  },
  {
    name: 'get_post',
    description:
      'Get full details for a single Product Hunt launch by its slug — description, makers, topics, and vote/comment counts. Use after top_launches to dig into a specific new product / startup launch. Example: get_post({ slug: "notion" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: {
          type: 'string',
          description: 'The Product Hunt post slug (e.g. "notion"), from a launch\'s url/slug.',
        },
        _apiKey: {
          type: 'string',
          description:
            'Optional — your own Product Hunt developer token for higher limits; omit to use the shared Pipeworx key.',
        },
      },
      required: ['slug'],
    },
  },
];

// Single GraphQL helper — POST with Bearer auth, JSON body.
// Returns { error, message } shapes for the caller rather than throwing,
// matching the no-token / non-2xx / graphql-error contract.
async function phQuery(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  if (!apiKey) {
    return { error: 'api_key_required', message: 'No Product Hunt token available.' };
  }

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: res.status, message: text };
  }

  const json = (await res.json()) as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    return { error: 'graphql_error', message: json.errors[0]?.message ?? 'GraphQL error' };
  }

  return json.data;
}

const TOP_LAUNCHES_QUERY = `query($first:Int!,$order:PostsOrder!){ posts(first:$first, order:$order){ edges{ node{ id name tagline votesCount commentsCount url website slug featuredAt createdAt topics(first:3){ edges{ node{ name } } } } } } }`;

const GET_POST_QUERY = `query($slug:String!){ post(slug:$slug){ id name tagline description votesCount commentsCount url website slug featuredAt createdAt makers{ name username } topics(first:5){ edges{ node{ name } } } } }`;

type PostNode = {
  id: string;
  name: string;
  tagline: string;
  description?: string;
  votesCount: number;
  commentsCount: number;
  url: string;
  website: string;
  slug: string;
  featuredAt: string;
  createdAt: string;
  makers?: Array<{ name: string; username: string }>;
  topics?: { edges?: Array<{ node: { name: string } }> };
};

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'top_launches':
      return topLaunches(args, apiKey);
    case 'get_post':
      return getPost(args.slug as string, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function topLaunches(args: Record<string, unknown>, apiKey: string) {
  const first = Math.min(20, Math.max(1, (args.first as number) || 10));
  const order = (args.order as string) || 'RANKING';

  const data = (await phQuery(apiKey, TOP_LAUNCHES_QUERY, { first, order })) as
    | { posts?: { edges?: Array<{ node: PostNode }> } }
    | { error: string | number; message: string };

  if (data && typeof data === 'object' && 'error' in data) return data;

  const posts = data as { posts?: { edges?: Array<{ node: PostNode }> } };
  const launches = (posts.posts?.edges || [])
    .map((e) => e.node)
    .map((n) => ({
      id: n.id,
      name: n.name,
      tagline: n.tagline,
      votes: n.votesCount,
      comments: n.commentsCount,
      url: n.url,
      website: n.website,
      slug: n.slug,
      featured_at: n.featuredAt,
      topics: (n.topics?.edges || []).map((t) => t.node.name),
    }));

  return { launches };
}

async function getPost(slug: string, apiKey: string) {
  const data = (await phQuery(apiKey, GET_POST_QUERY, { slug })) as
    | { post?: PostNode }
    | { error: string | number; message: string };

  if (data && typeof data === 'object' && 'error' in data) return data;

  const post = (data as { post?: PostNode }).post;
  if (!post) {
    return { error: 'not_found', message: `No Product Hunt launch found for slug "${slug}".` };
  }

  return {
    id: post.id,
    name: post.name,
    tagline: post.tagline,
    description: (post.description || '').slice(0, 1000),
    votes: post.votesCount,
    comments: post.commentsCount,
    url: post.url,
    website: post.website,
    slug: post.slug,
    featured_at: post.featuredAt,
    makers: (post.makers || []).map((m) => ({ name: m.name, username: m.username })),
    topics: (post.topics?.edges || []).map((t) => t.node.name),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
