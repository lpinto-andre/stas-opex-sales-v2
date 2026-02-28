import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildInsightsContextPack } from '@/features/insights/context';
import { requestInsightsReply } from '@/features/insights/api';
import type { InsightsMessage } from '@/features/insights/chatTypes';
import { useAppStore } from '@/state/store';

const MAX_HISTORY = 12;
const SESSION_KEY = 'stas-insights-session-id';
const PRICING_ROUTE = '/pricing';
const PRICING_COMPARATOR_ROUTE = '/pricing-comparator';
const PRICING_COMPARATOR_ALIAS_ROUTE = '/pricing/comparator';
const POTENTIAL_ROUTE = '/potential-tables';
const INSIGHTS_ROUTE = '/insights';
const TIPS_ROUTE = '/tips';

const getSessionId = () => {
  if (typeof window === 'undefined') return 'server-session';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
};

const pickKnown = (value: Record<string, unknown> | undefined, keys: string[]) => {
  const source = value ?? {};
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    if (source[key] === undefined) return acc;
    acc[key] = source[key];
    return acc;
  }, {});
};

const isPricingComparatorRoute = (route: string) =>
  route.startsWith(PRICING_COMPARATOR_ROUTE) || route.startsWith(PRICING_COMPARATOR_ALIAS_ROUTE);

const isPricingRoute = (route: string) => route.startsWith(PRICING_ROUTE) && !isPricingComparatorRoute(route);

const isPotentialRoute = (route: string) => route.startsWith(POTENTIAL_ROUTE);

const scopedStateForContext = (
  route: string,
  globalFilters: Record<string, unknown>,
  pricingViewRaw: Record<string, unknown> | undefined,
  potentialViewRaw: Record<string, unknown> | undefined
) => {
  if (isPricingComparatorRoute(route)) {
    return pickKnown(pricingViewRaw, [
      'comparatorCompareBy',
      'comparatorSelectedValues',
      'comparatorByPartEnabled',
      'comparatorSelectedPart',
      'comparatorPeriodMode',
      'comparatorFromMonth',
      'comparatorToMonth',
      'selectedTerritories',
      'selectedClasses',
      'searchText'
    ]);
  }
  if (isPricingRoute(route)) {
    return pickKnown(pricingViewRaw, [
      'periodMode',
      'fromMonth',
      'toMonth',
      'searchText',
      'selectedCustomers',
      'selectedCountries',
      'selectedTerritories',
      'selectedParts',
      'selectedProdGroups',
      'selectedClasses'
    ]);
  }
  if (isPotentialRoute(route)) {
    return pickKnown(potentialViewRaw, [
      'selectedTerritory',
      'selectedCustomers',
      'equipmentCustomerFilter',
      'equipmentTypeFilter',
      'equipmentItemFilter'
    ]);
  }
  if (route.startsWith(INSIGHTS_ROUTE) || route.startsWith(TIPS_ROUTE)) return { ...pickKnown(potentialViewRaw, ['selectedTerritory', 'selectedCustomers']), ...globalFilters };
  return globalFilters;
};

const countFilledEntries = (value: Record<string, unknown>) =>
  Object.values(value).reduce<number>((count, entry) => {
    if (Array.isArray(entry)) return count + (entry.length ? 1 : 0);
    if (typeof entry === 'string') return count + (entry.trim() ? 1 : 0);
    return count + (entry ? 1 : 0);
  }, 0);

const toTextArray = (value: unknown) => (Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : []);

const activeContextChips = (
  route: string,
  globalFilters: Record<string, unknown>,
  pricingViewRaw: Record<string, unknown> | undefined,
  potentialViewRaw: Record<string, unknown> | undefined
) => {
  if (isPricingComparatorRoute(route)) {
    const compareBy = String(pricingViewRaw?.comparatorCompareBy ?? 'country');
    const selectedValues = toTextArray(pricingViewRaw?.comparatorSelectedValues);
    const selectedPart = toTextArray(pricingViewRaw?.comparatorSelectedPart)[0];
    const periodMode = String(pricingViewRaw?.comparatorPeriodMode ?? 'all');
    const periodRange = [String(pricingViewRaw?.comparatorFromMonth ?? ''), String(pricingViewRaw?.comparatorToMonth ?? '')]
      .filter(Boolean)
      .join(' to ');
    return [
      PRICING_COMPARATOR_ROUTE,
      `compare by: ${compareBy}`,
      `values: ${selectedValues.length}`,
      selectedPart ? `part: ${selectedPart}` : null,
      periodRange ? `period: ${periodMode} (${periodRange})` : `period: ${periodMode}`
    ].filter(Boolean) as string[];
  }
  if (isPricingRoute(route)) {
    const selectedCustomers = toTextArray(pricingViewRaw?.selectedCustomers);
    const selectedCountries = toTextArray(pricingViewRaw?.selectedCountries);
    const selectedTerritories = toTextArray(pricingViewRaw?.selectedTerritories);
    const selectedParts = toTextArray(pricingViewRaw?.selectedParts);
    const selectedGroups = toTextArray(pricingViewRaw?.selectedProdGroups);
    return [
      PRICING_ROUTE,
      `customers: ${selectedCustomers.length}`,
      `countries: ${selectedCountries.length}`,
      `territories: ${selectedTerritories.length}`,
      `parts: ${selectedParts.length}`,
      `groups: ${selectedGroups.length}`
    ];
  }
  if (isPotentialRoute(route)) {
    const territory = String(potentialViewRaw?.selectedTerritory ?? '');
    const customers = toTextArray(potentialViewRaw?.selectedCustomers);
    return [
      POTENTIAL_ROUTE,
      territory ? `territory: ${territory}` : null,
      `customers: ${customers.length}`
    ].filter(Boolean) as string[];
  }
  return [route, `active filters: ${countFilledEntries(globalFilters)}`];
};

const initialAssistantMessage = (lang: 'fr' | 'en', route: string): InsightsMessage => ({
  role: 'assistant',
  content: lang === 'fr'
    ? `Contexte actif : ${route}. Je réponds uniquement pour cette page et ses filtres actifs.`
    : `Active context: ${route}. I will answer only for this page and its active filters.`
});

export function InsightsChatDock() {
  const location = useLocation();
  const uiLang = useAppStore((state) => state.uiLang);
  const globalFilters = useAppStore((state) => state.filters);
  const datasetMeta = useAppStore((state) => state.datasetMeta);
  const potentialRaw = useAppStore((state) => state.pageState.potential as Record<string, unknown> | undefined);
  const potentialViewRaw = useAppStore((state) => state.pageState.potentialView as Record<string, unknown> | undefined);
  const pricingViewRaw = useAppStore((state) => state.pageState.pricing as Record<string, unknown> | undefined);
  const sessionId = useMemo(() => getSessionId(), []);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<Record<string, InsightsMessage[]>>({});
  const previousContextKeyRef = useRef('');

  const contextScopeState = useMemo(
    () => scopedStateForContext(location.pathname, globalFilters as Record<string, unknown>, pricingViewRaw, potentialViewRaw),
    [location.pathname, globalFilters, pricingViewRaw, potentialViewRaw]
  );
  const contextChips = useMemo(
    () => activeContextChips(location.pathname, globalFilters as Record<string, unknown>, pricingViewRaw, potentialViewRaw),
    [location.pathname, globalFilters, pricingViewRaw, potentialViewRaw]
  );
  const contextKey = useMemo(() => `${location.pathname}|${JSON.stringify(contextScopeState)}`, [location.pathname, contextScopeState]);
  const messages = conversations[contextKey] ?? [initialAssistantMessage(uiLang, location.pathname)];

  const t = uiLang === 'fr' ? {
    button: 'Insights IA',
    title: 'STAS Insights Assistant',
    placeholder: 'Posez une question sur les données ou l’utilisation de l’app',
    send: 'Envoyer',
    sending: 'Analyse…',
    reset: 'Réinitialiser',
    collapse: 'Réduire',
    assistantLabel: 'Assistant',
    youLabel: 'Vous',
    tipTitle: 'Prompts utiles',
    activeContext: 'Contexte actif'
  } : {
    button: 'Insights AI',
    title: 'STAS Insights Assistant',
    placeholder: 'Ask about data, filters, or page usage',
    send: 'Send',
    sending: 'Analyzing...',
    reset: 'Reset',
    collapse: 'Collapse',
    assistantLabel: 'Assistant',
    youLabel: 'You',
    tipTitle: 'Useful prompts',
    activeContext: 'Active context'
  };

  const quickPrompts = useMemo(() => {
    if (isPricingComparatorRoute(location.pathname)) {
      return uiLang === 'fr'
        ? [
          'Sur la page pricing-comparator, quels filtres comparer en priorité ?',
          'Explique les KPI de marge et profit pour mes valeurs sélectionnées.',
          'Quelle table dois-je vérifier pour valider cette comparaison ?'
        ]
        : [
          'On pricing-comparator, which filters should I compare first?',
          'Explain margin and profit KPIs for my selected values.',
          'Which table should I check to validate this comparison?'
        ];
    }
    if (isPricingRoute(location.pathname)) {
      return uiLang === 'fr'
        ? [
          'Sur la page pricing, quels filtres réduisent le plus le dataset ?',
          'Résume les KPI actuels (revenue, cost, profit, margin).',
          'Quelle table dois-je trier pour trouver les lignes les moins rentables ?'
        ]
        : [
          'On pricing, which filters narrow the dataset the most?',
          'Summarize current KPIs (revenue, cost, profit, margin).',
          'Which table sort should I use to find the least profitable lines?'
        ];
    }
    if (isPotentialRoute(location.pathname)) {
      return uiLang === 'fr'
        ? [
          'Sur potential-tables, quels filtres montrent les clients à faible coverage ?',
          'Explique le KPI coverage par company, product et item.',
          'Quelle table confirme les valeurs theoretical vs real consumption ?'
        ]
        : [
          'On potential-tables, which filters expose low-coverage customers?',
          'Explain coverage KPIs by company, product, and item.',
          'Which table confirms theoretical vs real consumption values?'
        ];
    }
    return uiLang === 'fr'
      ? [
        'Sur cette page, quel filtre appliquer en premier sur le dataset ?',
        'Quels KPI dois-je vérifier en priorité avec ces filtres ?',
        'Quelle table ou graphique est le plus utile ici ?'
      ]
      : [
        'On this page, which filter should I apply first on the dataset?',
        'Which KPIs should I review first with these filters?',
        'Which table or chart is most useful here?'
      ];
  }, [uiLang, location.pathname]);

  useEffect(() => {
    setConversations((prev) => {
      if (prev[contextKey]) return prev;
      return { ...prev, [contextKey]: [initialAssistantMessage(uiLang, location.pathname)] };
    });
  }, [contextKey, uiLang, location.pathname]);

  useEffect(() => {
    if (!previousContextKeyRef.current) {
      previousContextKeyRef.current = contextKey;
      return;
    }
    if (previousContextKeyRef.current === contextKey) return;
    previousContextKeyRef.current = contextKey;
    if (!open) return;
    setConversations((prev) => {
      const current = prev[contextKey] ?? [initialAssistantMessage(uiLang, location.pathname)];
      if (current.some((message) => message.role === 'assistant' && (message.content.includes('Context switched') || message.content.includes('Contexte changé')))) return prev;
      const notice: InsightsMessage = {
        role: 'assistant',
        content: uiLang === 'fr'
          ? `Contexte changé : ${location.pathname}. Je vais maintenant me baser uniquement sur cette page et ses filtres actifs.`
          : `Context switched: ${location.pathname}. I will now use only this page and its active filters.`
      };
      return { ...prev, [contextKey]: [...current.slice(-MAX_HISTORY + 1), notice] };
    });
  }, [contextKey, open, uiLang, location.pathname]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    const nextUser: InsightsMessage = { role: 'user', content: text };
    const requestContextKey = contextKey;
    const currentHistory = conversations[requestContextKey] ?? [initialAssistantMessage(uiLang, location.pathname)];
    const nextHistory = [...currentHistory, nextUser].slice(-MAX_HISTORY);
    setConversations((prev) => ({ ...prev, [requestContextKey]: nextHistory }));
    setPending(true);
    try {
      const context = await buildInsightsContextPack({
        route: location.pathname,
        language: uiLang,
        globalFilters,
        datasetMeta,
        potentialRaw,
        potentialViewRaw,
        pricingViewRaw
      });
      const reply = await requestInsightsReply({ messages: [nextUser], context, sessionId });
      const answerWithTips = reply.tips.length
        ? `${reply.answer}\n\n${reply.tips.map((tip) => `- ${tip}`).join('\n')}`
        : reply.answer;
      const assistantMessage: InsightsMessage = { role: 'assistant', content: answerWithTips };
      setConversations((prev) => {
        const thread = prev[requestContextKey] ?? [];
        return { ...prev, [requestContextKey]: [...thread, assistantMessage].slice(-MAX_HISTORY) };
      });
    } finally {
      setPending(false);
    }
  };

  return <>
    <button
      type="button"
      className="fixed bottom-4 right-4 insights-fab px-5 py-2.5 text-sm font-semibold z-[80]"
      onClick={() => setOpen((value) => !value)}
    >
      {t.button}
    </button>

    {open && <section className="fixed bottom-16 right-4 w-[24rem] max-w-[calc(100vw-2rem)] h-[36rem] insights-panel p-3 z-[80] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t.title}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="card px-2 py-1 text-xs"
            onClick={() => setConversations((prev) => ({ ...prev, [contextKey]: [initialAssistantMessage(uiLang, location.pathname)] }))}
          >
            {t.reset}
          </button>
          <button
            type="button"
            className="card px-2 py-1 text-xs leading-none"
            onClick={() => setOpen(false)}
            aria-label={t.collapse}
            title={t.collapse}
          >
            -
          </button>
        </div>
      </div>

      <div className="card p-2 text-[11px]">
        <p className="font-semibold mb-1">{t.activeContext}</p>
        <div className="flex flex-wrap gap-1">
          {contextChips.map((chip) => <span key={chip} className="card px-2 py-1">{chip}</span>)}
        </div>
      </div>

      <div className="card p-2 text-xs">
        <p className="font-semibold mb-1">{t.tipTitle}</p>
        <div className="flex flex-wrap gap-1">
          {quickPrompts.map((prompt) => <button key={prompt} type="button" className="card px-2 py-1 text-[11px]" onClick={() => setInput(prompt)}>{prompt}</button>)}
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-2 pr-1">
        {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`card p-2 text-xs whitespace-pre-wrap ${message.role === 'assistant' ? '' : 'border-[var(--teal)]'}`}>
          <p className="font-semibold mb-1">{message.role === 'assistant' ? t.assistantLabel : t.youLabel}</p>
          <p>{message.content}</p>
        </article>)}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={t.placeholder}
          className="card insights-compose-input px-2.5 py-1.5 text-xs flex-1"
        />
        <button type="button" className="card insights-send-btn px-3.5 py-1.5 text-xs" disabled={pending} onClick={() => void sendMessage()}>
          {pending ? t.sending : t.send}
        </button>
      </div>
    </section>}
  </>;
}
