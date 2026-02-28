import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppStore } from '@/state/store';

type Playbook = {
  key: string;
  title: string;
  description: string;
  to: string;
  prompts: string[];
  checks: string[];
};

const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

export function TipsPage() {
  const uiLang = useAppStore((state) => state.uiLang);
  const [copiedPrompt, setCopiedPrompt] = useState('');

  const t = uiLang === 'fr' ? {
    title: 'Conseils',
    subtitle: 'Guide pratique pour trouver les meilleures opportunités, poser les bonnes questions et décider plus vite.',
    heroLine: 'Utilisez STAS Insights Assistant avec des prompts précis basés sur la page et les filtres actifs.',
    assistantHint: 'Le chat est disponible via le bouton « Insights IA » en bas à droite.',
    copied: 'Prompt copié',
    openPage: 'Ouvrir',
    quickStartTitle: 'Par où commencer',
    quickStartSteps: [
      'Importez ShippedSO et vos fichiers Full Potential dans Dataset Manager.',
      'Sur Potential, sélectionnez un territoire puis isolez les clients prioritaires.',
      'Utilisez la page Database pour consulter les descriptions complètes des pièces et relier les part numbers à leur signification.',
      'Si vous utilisez un petit écran, zoomez légèrement vers l’arrière (Ctrl + -) pour rendre l’interface plus confortable.',
      'Validez les causes avec Pricing et Pricing Comparator.',
      'Posez une question orientée action : top 3 priorités, risques d’interprétation, prochaine étape.'
    ],
    askBetterTitle: 'Poser de meilleures questions',
    askBetterItems: [
      'L’assistant utilise déjà la page et les filtres actifs.',
      'Commencez par l’objectif métier et le résultat attendu.',
      'Demandez une réponse priorisée (top 3 / top 5).',
      'Demandez la logique de calcul pour éviter les erreurs.',
      'Demandez la prochaine action à faire dans l’application.'
    ],
    avoidTitle: 'À éviter',
    avoidItems: [
      'Questions trop larges sans contexte de page.',
      'Mélanger Pricing et Potential sans préciser le scope.',
      'Confondre NA avec 0% de coverage.',
      'Prendre une décision sans vérifier le tableau source.'
    ],
    playbooksTitle: 'Playbooks prêts à l’emploi',
    promptTemplateTitle: 'Strong prompt templates',
    checklistTitle: 'Checklist avant décision',
    checklistItems: [
      'Les filtres actifs sont-ils explicites ?',
      'La période est-elle correcte ?',
      'Les NA et exceptions sont-ils séparés des vrais 0% ?',
      'La priorité est-elle basée sur la valeur ($ gap, marge, revenu) ?'
    ],
    styleNote: 'Astuce : cliquez sur un prompt pour le copier.',
    copiedFeedback: 'Prompt copié dans le presse-papiers.'
  } : {
    title: 'Tips',
    subtitle: 'Practical guide to find high-value opportunities, ask better questions, and decide faster.',
    heroLine: 'Use STAS Insights Assistant with prompts grounded in the current page and active filters.',
    assistantHint: 'Chat is available via the “Insights AI” bubble at bottom-right.',
    copied: 'Prompt copied',
    openPage: 'Open',
    quickStartTitle: 'Where to start',
    quickStartSteps: [
      'Import ShippedSO and Full Potential files in Dataset Manager.',
      'In Potential, select one territory and isolate priority customers.',
      'Use the Database page to consult full part descriptions and connect part numbers to their meaning.',
      'If you are on a small screen, zoom out slightly (Ctrl + -) to make the layout easier to use.',
      'Validate root causes in Pricing and Pricing Comparator.',
      'Ask action-oriented questions: top 3 priorities, interpretation risks, next step.'
    ],
    askBetterTitle: 'Ask better questions',
    askBetterItems: [
      'The assistant already uses the active page and filters.',
      'Start with business objective and expected output.',
      'Ask for ranked output (top 3 / top 5).',
      'Ask for calculation logic to reduce interpretation errors.',
      'Ask for the next concrete action in the app.'
    ],
    avoidTitle: 'Avoid this',
    avoidItems: [
      'Broad questions with no page context.',
      'Mixing Pricing and Potential without explicit scope.',
      'Treating NA as 0% coverage.',
      'Making decisions without checking source table evidence.'
    ],
    playbooksTitle: 'Ready-to-use playbooks',
    promptTemplateTitle: 'Strong prompt templates',
    checklistTitle: 'Pre-decision checklist',
    checklistItems: [
      'Are active filters explicit?',
      'Is the selected period correct?',
      'Are NA and exceptions separated from true 0% coverage?',
      'Is prioritization based on value ($ gap, margin, revenue)?'
    ],
    styleNote: 'Tip: click any prompt to copy it.',
    copiedFeedback: 'Prompt copied to clipboard.'
  };

  const strongTemplates = useMemo(() => uiLang === 'fr'
    ? [
      'Objectif : prioriser les opportunités de cette page. Donne top 5, impact $, et action recommandée.',
      'Explique les 3 signaux les plus critiques visibles ici et pourquoi ils sont importants.',
      'Donne-moi les principaux risques d’interprétation avec les filtres actifs, puis comment les éviter.',
      'Transforme ce constat en plan d’action en 3 étapes dans l’application.',
      'Résume ce que je dois vérifier dans le tableau pour valider les chiffres des graphiques.'
    ]
    : [
      'Goal: prioritize opportunities on this page. Give top 5, $ impact, and recommended action.',
      'Explain the 3 most critical signals visible here and why they matter.',
      'Give the main interpretation risks with current active filters, then how to avoid them.',
      'Turn this finding into a 3-step action plan inside the app.',
      'Summarize what I should verify in the table to validate chart numbers.'
    ], [uiLang]);

  const playbooks = useMemo<Playbook[]>(() => uiLang === 'fr'
    ? [
      {
        key: 'potential',
        title: 'Potential Tables',
        description: 'Identifier vite les clients/items avec le plus fort potentiel.',
        to: '/potential-tables',
        prompts: [
          'Donne les 5 clients avec le plus grand $ gap et explique pourquoi.',
          'Quels items ont Theor > 0 et Real = 0, classés par impact ?',
          'Quels clients ont beaucoup de NA et doivent être exclus de la comparaison ?'
        ],
        checks: ['Territoire choisi', 'Clients ciblés', 'Exceptions revues']
      },
      {
        key: 'pricing',
        title: 'Pricing',
        description: 'Trouver les poches de marge faible à fort enjeu.',
        to: '/pricing',
        prompts: [
          'Quels clients ont revenu élevé mais marge faible avec ces filtres ?',
          'Classe les part numbers à profit négatif et revenu significatif.',
          'Quel filtre appliquer ensuite pour isoler une action commerciale ?'
        ],
        checks: ['Période validée', 'Tri tableau vérifié', 'Marge vs revenu cohérent']
      },
      {
        key: 'comparator',
        title: 'Pricing Comparator',
        description: 'Expliquer les écarts de performance entre segments.',
        to: '/pricing-comparator',
        prompts: [
          'Où se situe le plus gros écart de marge et profit ?',
          'Quel segment a la meilleure rentabilité stable dans le temps ?',
          'Quelle hypothèse prix/coût explique l’écart observé ?'
        ],
        checks: ['Mode de comparaison', 'Valeurs choisies', 'Période cohérente']
      },
      {
        key: 'dashboard',
        title: 'Dashboard',
        description: 'Prioriser les analyses à plus forte valeur.',
        to: '/explorer',
        prompts: [
          'Quels KPI ont le plus changé avec mes filtres ?',
          'Quel groupe produit prioriser pour un impact court terme ?',
          'Propose une stratégie d’exploration en 3 étapes.'
        ],
        checks: ['KPI vérifiés', 'Tendance cohérente', 'Top groupes confirmés']
      }
    ]
    : [
      {
        key: 'potential',
        title: 'Potential Tables',
        description: 'Quickly identify customers/items with the highest upside.',
        to: '/potential-tables',
        prompts: [
          'Rank top 5 customers by largest $ gap and explain why.',
          'Which items have Theor > 0 and Real = 0, ranked by impact?',
          'Which customers have many NA rows and should be excluded from comparison?'
        ],
        checks: ['Territory selected', 'Target customers', 'Exceptions reviewed']
      },
      {
        key: 'pricing',
        title: 'Pricing',
        description: 'Find low-margin pockets with strong business impact.',
        to: '/pricing',
        prompts: [
          'Which customers have high revenue but low margin with current filters?',
          'Rank part numbers with negative profit and meaningful revenue.',
          'Which next filter isolates a concrete commercial action?'
        ],
        checks: ['Period validated', 'Table sort reviewed', 'Margin vs revenue aligned']
      },
      {
        key: 'comparator',
        title: 'Pricing Comparator',
        description: 'Explain performance gaps across segments.',
        to: '/pricing-comparator',
        prompts: [
          'Where is the largest margin and profit gap across compared values?',
          'Which segment has the most stable profitability over time?',
          'What price/cost hypothesis explains the observed gap?'
        ],
        checks: ['Compare mode', 'Selected values', 'Period coherence']
      },
      {
        key: 'dashboard',
        title: 'Dashboard',
        description: 'Prioritize the highest-value analysis first.',
        to: '/explorer',
        prompts: [
          'Which KPIs changed most with my current filters?',
          'Which product group should I prioritize for short-term impact?',
          'Propose a 3-step exploration strategy from this page.'
        ],
        checks: ['KPI checked', 'Trend coherence', 'Top groups validated']
      }
    ], [uiLang]);

  const onCopy = async (prompt: string) => {
    try {
      await copyToClipboard(prompt);
      setCopiedPrompt(prompt);
      window.setTimeout(() => setCopiedPrompt(''), 1400);
    } catch {
      setCopiedPrompt('');
    }
  };

  return <div className="space-y-4">
    <PageHeader title={t.title} subtitle={t.subtitle} />

    <section className="tips-hero p-5">
      <p className="tips-hero-lead">{t.heroLine}</p>
      <p className="text-sm mt-2">{t.assistantHint}</p>
      <p className="text-xs mt-3 text-[var(--text-muted)]">{t.styleNote}</p>
      {copiedPrompt && <p className="text-xs mt-1 text-[var(--teal)]">{t.copiedFeedback}</p>}
    </section>

    <div className="grid xl:grid-cols-2 gap-4">
      <section className="tips-panel p-4">
        <h3 className="font-semibold mb-2">{t.quickStartTitle}</h3>
        <ol className="space-y-2 text-sm list-decimal pl-5">
          {t.quickStartSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>
      <section className="tips-panel p-4">
        <h3 className="font-semibold mb-2">{t.promptTemplateTitle}</h3>
        <div className="space-y-2">
          {strongTemplates.map((template) => <button
            key={template}
            type="button"
            className={`tips-prompt-btn w-full text-left ${copiedPrompt === template ? 'tips-prompt-btn-active' : ''}`}
            onClick={() => void onCopy(template)}
          >
            {template}
          </button>)}
        </div>
        {copiedPrompt && <p className="text-xs mt-2 text-[var(--teal)]">{t.copiedFeedback}</p>}
      </section>
    </div>

    <div className="grid xl:grid-cols-2 gap-4">
      <section className="tips-panel p-4">
        <h3 className="font-semibold mb-2">{t.askBetterTitle}</h3>
        <div className="space-y-2">
          {t.askBetterItems.map((item) => <div key={item} className="tips-line-item">{item}</div>)}
        </div>
      </section>
      <section className="tips-panel p-4">
        <h3 className="font-semibold mb-2">{t.avoidTitle}</h3>
        <div className="space-y-2">
          {t.avoidItems.map((item) => <div key={item} className="tips-line-item tips-line-item-warn">{item}</div>)}
        </div>
      </section>
    </div>

    <section className="tips-panel p-4">
      <h3 className="font-semibold mb-3">{t.playbooksTitle}</h3>
      <div className="grid xl:grid-cols-2 gap-4">
        {playbooks.map((playbook) => <article key={playbook.key} className="tips-playbook p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm">{playbook.title}</h4>
            <Link to={playbook.to} className="tips-link-btn">{t.openPage}</Link>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{playbook.description}</p>
          <div className="space-y-1">
            {playbook.prompts.map((prompt) => <button
              key={prompt}
              type="button"
              className={`tips-prompt-btn w-full text-left ${copiedPrompt === prompt ? 'tips-prompt-btn-active' : ''}`}
              onClick={() => void onCopy(prompt)}
            >
              {prompt}
            </button>)}
          </div>
          <div className="flex flex-wrap gap-1">
            {playbook.checks.map((check) => <span key={check} className="tips-chip">{check}</span>)}
          </div>
        </article>)}
      </div>
    </section>

    <section className="tips-panel p-4">
      <h3 className="font-semibold mb-2">{t.checklistTitle}</h3>
      <div className="grid xl:grid-cols-2 gap-2">
        {t.checklistItems.map((item) => <div key={item} className="tips-line-item">{item}</div>)}
      </div>
    </section>
  </div>;
}
