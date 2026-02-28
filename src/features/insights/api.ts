import type { InsightsContextPack, InsightsMessage, InsightsReply } from '@/features/insights/chatTypes';

type InsightsRequest = {
  messages: InsightsMessage[];
  context: InsightsContextPack;
  sessionId?: string;
};

const endpoint = import.meta.env.VITE_INSIGHTS_API_URL ?? '/api/insights/chat';

const outOfScopeKeywords = [
  'weather', 'movie', 'recipe', 'politics', 'sport', 'stock', 'crypto', 'news', 'vacation', 'travel itinerary', 'joke',
  'poem', 'horoscope', 'astrology', 'bitcoin price', 'celebrity'
];

const detectReplyLanguage = (message: string, fallback: 'fr' | 'en') => {
  const lower = message.toLowerCase();
  const hasFrenchAccents = /[\u00e0\u00e2\u00e7\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f9\u00fb\u00fc\u0153]/.test(lower);
  const frenchTokens = ['bonjour', 'merci', 'donnees', 'filtres', 'filtre', 'page', 'territoire', 'client', 'couverture', 'application'];
  if (hasFrenchAccents || frenchTokens.some((token) => lower.includes(token))) return 'fr' as const;
  return fallback;
};

const isLikelyInScope = (text: string) => {
  const lower = text.toLowerCase();
  // Lightweight guardrail: block only clearly out-of-scope intents.
  return !outOfScopeKeywords.some((token) => lower.includes(token));
};

function localFallback(request: InsightsRequest): InsightsReply {
  const lastUser = [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const replyLanguage = detectReplyLanguage(lastUser, request.context.language);
  if (!isLikelyInScope(lastUser)) {
    return {
      in_scope: false,
      answer: replyLanguage === 'fr'
        ? 'Je peux aider uniquement sur cette application et ses donnees importees. Posez une question sur les pages, filtres, KPIs ou tableaux.'
        : 'I can only help with this application and its imported data. Ask about pages, filters, KPIs, or tables.',
      tips: []
    };
  }
  const tips = [
    request.context.dataset.loaded
      ? `Dataset rows: ${request.context.dataset.rowCount.toLocaleString()}`
      : 'No ShippedSO dataset loaded yet.',
    `Potential files imported: ${request.context.potential.importedFiles.toLocaleString()}`,
    `Current route: ${request.context.route}`
  ];
  return {
    in_scope: true,
    answer: replyLanguage === 'fr'
      ? 'Le service Insights API est indisponible. Je fournis une reponse locale de secours basee sur le contexte courant.'
      : 'Insights API is unavailable. Returning a local fallback answer from current app context.',
    tips
  };
}

export async function requestInsightsReply(request: InsightsRequest): Promise<InsightsReply> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.sessionId ? { 'x-insights-session': request.sessionId } : {})
      },
      body: JSON.stringify(request)
    });
    const raw = await response.text();
    let data: Partial<InsightsReply> | null = null;
    try {
      data = raw ? JSON.parse(raw) as Partial<InsightsReply> : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      if (data && typeof data.answer === 'string') {
        return {
          answer: data.answer,
          tips: Array.isArray(data.tips) ? data.tips.map((value) => String(value)) : [],
          in_scope: Boolean(data.in_scope)
        };
      }
      return localFallback(request);
    }
    if (!data || typeof data.answer !== 'string') return localFallback(request);
    return {
      answer: data.answer,
      tips: Array.isArray(data.tips) ? data.tips.map((value) => String(value)) : [],
      in_scope: Boolean(data.in_scope)
    };
  } catch {
    return localFallback(request);
  }
}
