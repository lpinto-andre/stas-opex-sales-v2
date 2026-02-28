import { resolve } from 'path';
import { createHash } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type InsightsRequestPayload = {
  messages?: Array<{ role?: string; content?: string }>;
  context?: Record<string, unknown>;
};

type SessionRateState = {
  windowStartMs: number;
  requestCount: number;
  contextChars: number;
  lastSeenMs: number;
};

const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_CONTEXT_CHARS_PER_WINDOW = 140_000;
const MAX_CONTEXT_CHARS_PER_REQUEST = 24_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessionState = new Map<string, SessionRateState>();

const outOfScopeKeywords = [
  'weather', 'movie', 'recipe', 'politics', 'sport', 'stock', 'crypto', 'news', 'travel', 'joke',
  'poem', 'horoscope', 'astrology', 'bitcoin price', 'celebrity'
];

const readJson = async (req: IncomingMessage) => new Promise<InsightsRequestPayload>((resolveJson, rejectJson) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolveJson(raw ? JSON.parse(raw) as InsightsRequestPayload : {});
    } catch (error) {
      rejectJson(error);
    }
  });
  req.on('error', (error) => rejectJson(error));
});

const writeJson = (res: ServerResponse, status: number, body: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const nowMs = () => Date.now();

const pruneSessions = () => {
  const now = nowMs();
  for (const [id, state] of sessionState.entries()) {
    if (now - state.lastSeenMs > SESSION_TTL_MS) sessionState.delete(id);
  }
};

const getSessionId = (req: IncomingMessage) => {
  const headerId = req.headers['x-insights-session'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();
  const ip = req.socket.remoteAddress ?? 'unknown';
  const ua = req.headers['user-agent'] ?? 'unknown';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 24);
};

const checkRateLimits = (sessionId: string, contextChars: number) => {
  pruneSessions();
  const now = nowMs();
  const previous = sessionState.get(sessionId);
  if (!previous || now - previous.windowStartMs > RATE_WINDOW_MS) {
    const next: SessionRateState = { windowStartMs: now, requestCount: 1, contextChars, lastSeenMs: now };
    sessionState.set(sessionId, next);
    return { ok: true };
  }
  const requestCount = previous.requestCount + 1;
  const totalContextChars = previous.contextChars + contextChars;
  const next: SessionRateState = {
    windowStartMs: previous.windowStartMs,
    requestCount,
    contextChars: totalContextChars,
    lastSeenMs: now
  };
  sessionState.set(sessionId, next);
  if (requestCount > MAX_REQUESTS_PER_WINDOW) return { ok: false, reason: 'rate_limit' as const };
  if (totalContextChars > MAX_CONTEXT_CHARS_PER_WINDOW) return { ok: false, reason: 'context_window_limit' as const };
  return { ok: true };
};

const isLikelyInScope = (text: string) => {
  const lower = text.toLowerCase();
  // Lightweight guardrail: block only clearly out-of-scope intents.
  return !outOfScopeKeywords.some((token) => lower.includes(token));
};

const extractResponseText = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return '';
  const data = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  if (Array.isArray(data.output)) {
    const chunks = data.output.flatMap((item) => {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [] as string[];
      return content
        .map((entry) => {
          const text = (entry as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        })
        .filter(Boolean);
    });
    return chunks.join('\n');
  }
  return '';
};

const SYSTEM_PROMPT = [
  'You are the STAS Insights assistant embedded inside a business analytics app.',
  'You must talk only about this app, its pages, filters, uploaded datasets, and metrics present in the provided context JSON.',
  'Treat the latest context JSON as authoritative, even when prior chat messages conflict with it.',
  'Prioritize the current page scope from context.scope.page and context.filters.',
  'Interpret generic references like "here", "this page", "current view", or "visible" as the current context JSON.',
  'For analytical answers, explicitly anchor to active scope in the first sentence (page + key filters from context).',
  'When context.scope.page is potential-tables, use only context.potential and context.signals.potential for data claims unless the user explicitly asks for cross-dataset comparison.',
  'When context.scope.page is potential-tables, treat context.potential.activeView.selectedTerritory and selectedCustomers as mandatory scope constraints.',
  'When context.scope.page is potential-tables and no territory is selected, explicitly ask the user to select a territory group before analysis.',
  'When context.scope.page is pricing-comparator, focus on comparator selections and comparator metrics only.',
  'Reply in the same language as the latest user message whenever possible; if unclear, use context.language.',
  'Do not switch to other pages/datasets unless user explicitly asks for cross-page comparison.',
  'If user asks about anything unrelated, mark in_scope=false and redirect briefly back to app/data topics.',
  'If context is missing data required to answer, say what is missing and suggest the next filter/view action.',
  'Never invent data that is not present in context.',
  'Return strict JSON with keys: answer (string), tips (string array), in_scope (boolean).',
  'Keep answer concise, actionable, and app-specific.'
].join(' ');

function insightsApiPlugin(openAiKey: string | undefined, modelName: string | undefined): Plugin {
  return {
    name: 'insights-api-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (req.method !== 'POST' || !url.startsWith('/api/insights/chat')) return next();
        try {
          const payload = await readJson(req);
          const sessionId = getSessionId(req);
          const messages = Array.isArray(payload.messages) ? payload.messages.slice(-12) : [];
          const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
          const contextJson = JSON.stringify(context);
          if (contextJson.length > MAX_CONTEXT_CHARS_PER_REQUEST) {
            return writeJson(res, 413, {
              answer: 'Context too large for one request. Narrow filters or scope.',
              tips: [],
              in_scope: true
            });
          }
          const rateCheck = checkRateLimits(sessionId, contextJson.length);
          if (!rateCheck.ok) {
            return writeJson(res, 429, {
              answer: rateCheck.reason === 'rate_limit'
                ? 'Too many requests in this session. Please retry shortly.'
                : 'Session context quota reached. Reduce context size or wait for reset.',
              tips: [],
              in_scope: true
            });
          }

          const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
          if (!isLikelyInScope(lastUserMessage)) {
            return writeJson(res, 200, {
              answer: 'I can only help with this application and its imported data. Ask about pages, filters, KPIs, or tables.',
              tips: [],
              in_scope: false
            });
          }

          const apiKey = openAiKey;
          if (!apiKey) {
            return writeJson(res, 503, {
              answer: 'Insights API key is missing on server. Set OPENAI_API_KEY in environment.',
              tips: [],
              in_scope: true
            });
          }

          const model = modelName ?? 'gpt-4.1-mini';
          const mappedMessages = messages.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: [{
              type: message.role === 'assistant' ? 'output_text' : 'input_text',
              text: String(message.content ?? '')
            }]
          }));
          const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              input: [
                { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
                ...mappedMessages,
                {
                  role: 'system',
                  content: [{
                    type: 'input_text',
                    text: `Authoritative active context JSON for this response:\n${contextJson}`
                  }]
                }
              ],
              text: {
                format: {
                  type: 'json_schema',
                  name: 'insights_reply',
                  strict: true,
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      answer: { type: 'string' },
                      tips: { type: 'array', items: { type: 'string' } },
                      in_scope: { type: 'boolean' }
                    },
                    required: ['answer', 'tips', 'in_scope']
                  }
                }
              },
              max_output_tokens: 700
            })
          });

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            return writeJson(res, 502, {
              answer: 'OpenAI request failed.',
              tips: [errorText.slice(0, 300)],
              in_scope: true
            });
          }

          const modelPayload = await openaiResponse.json() as unknown;
          const text = extractResponseText(modelPayload);
          try {
            const parsed = JSON.parse(text) as { answer?: unknown; tips?: unknown; in_scope?: unknown };
            return writeJson(res, 200, {
              answer: typeof parsed.answer === 'string' ? parsed.answer : 'No answer generated.',
              tips: Array.isArray(parsed.tips) ? parsed.tips.map((tip) => String(tip)) : [],
              in_scope: Boolean(parsed.in_scope)
            });
          } catch {
            return writeJson(res, 200, {
              answer: text || 'No answer generated.',
              tips: [],
              in_scope: true
            });
          }
        } catch (error) {
          return writeJson(res, 500, {
            answer: 'Insights endpoint failed.',
            tips: [error instanceof Error ? error.message : 'Unknown error'],
            in_scope: true
          });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const openAiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const modelName = env.OPENAI_MODEL || process.env.OPENAI_MODEL;
  return {
    plugins: [react(), insightsApiPlugin(openAiKey, modelName)],
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    }
  };
});
