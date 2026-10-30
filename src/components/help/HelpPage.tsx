import {
  AlertTriangle,
  ExternalLink,
  Github,
  HelpCircle,
  Keyboard,
  MessageCircle,
  Shield,
  Trophy,
  X,
  Youtube,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useLanguagePreference } from '../../i18n/context';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { helpContent } from './helpContent';
import type { HelpFaq, HelpFeature } from './helpContent';

interface HelpPageProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpPage({ isOpen, onClose }: HelpPageProps) {
  useEscapeClose(isOpen, onClose);
  const { language, t } = useLanguagePreference();
  const copy = helpContent[language];
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef);

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button
          onClick={onClose}
          aria-label={copy.close}
          className="fixed top-6 right-6 p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <Trophy className="w-10 h-10 text-gold-400" />
            <h1 className="text-3xl font-bold text-white">{t.appName}</h1>
          </div>
          <p className="text-slate-400">{copy.subtitle}</p>
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-gold-400" />
            {copy.features}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {copy.featureItems.map(feature => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-gold-400" />
            {copy.shortcuts}
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {copy.shortcutGroups.map(group => (
              <div
                key={group.title}
                className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50"
              >
                <div className="border-b border-slate-700/50 px-5 py-3 text-sm font-semibold text-white">
                  {group.title}
                </div>
                <div className="divide-y divide-slate-700/40">
                  {group.items.map(item => (
                    <div
                      key={`${group.title}-${item.keys}`}
                      className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center"
                    >
                      <kbd className="inline-flex min-w-[150px] self-start rounded-md border border-slate-600/70 bg-slate-900/80 px-2.5 py-1.5 font-mono text-xs text-gold-300 shadow-sm">
                        {item.keys}
                      </kbd>
                      <span className="text-sm text-slate-300">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/80">
            {copy.shortcutNote}
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.quickStart}</h2>
          <div className="space-y-6">
            {copy.steps.map((step, index) => (
              <StepBlock key={step.title} number={index + 1} title={step.title} steps={step.items} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.rules}</h2>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-3">{copy.swissRules}</h3>
              <div className="text-sm text-slate-300 space-y-3">
                {copy.swissRuleItems.map((rule, index) => (
                  <RuleItem key={rule.title} num={String(index + 1)} title={rule.title}>
                    {rule.text}
                  </RuleItem>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-3">{copy.swissRankingRules}</h3>
              <div className="text-sm text-slate-300 space-y-3">
                {copy.swissRankingRuleItems.map((rule, index) => (
                  <RuleItem key={rule.title} num={String(index + 1)} title={rule.title}>
                    {rule.text}
                  </RuleItem>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gold-400 mb-2">{copy.eliminationRules}</h3>
              <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                {copy.eliminationRuleItems.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold-400" />
            {copy.storage}
          </h2>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
              {copy.storageItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6">{copy.faq}</h2>
          <div className="space-y-4">
            {copy.faqItems.map(item => <FAQItem key={item.question} {...item} />)}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            {copy.disclaimer}
          </h2>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 space-y-3">
            {copy.disclaimerItems.map(item => (
              <p key={item} className="text-sm text-slate-300 leading-relaxed">{item}</p>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-gold-400" />
            {copy.links}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://github.com/yyt43/match-statistic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 hover:bg-slate-800/80 transition-colors group"
            >
              <div className="text-slate-300 group-hover:text-gold-400 transition-colors"><Github className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.github}</div>
                <div className="text-xs text-slate-400 truncate">github.com/yyt43/match-statistic</div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-gold-400 transition-colors shrink-0" />
            </a>
            <a
              href="https://space.bilibili.com/526320039"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 hover:bg-slate-800/80 transition-colors group"
            >
              <div className="text-slate-300 group-hover:text-gold-400 transition-colors"><Youtube className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.bilibili}</div>
                <div className="text-xs text-slate-400 truncate">space.bilibili.com/526320039</div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-gold-400 transition-colors shrink-0" />
            </a>
            <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 cursor-default">
              <div className="text-slate-300"><MessageCircle className="w-8 h-8" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white mb-0.5">{copy.qq}</div>
                <div className="text-xs text-slate-400 truncate">2845850691</div>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{copy.qqHint}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">{copy.contact}</p>
        </section>

        <div className="text-center text-slate-500 text-sm pt-6 border-t border-slate-700/50 space-y-1">
          <div>{copy.footer}</div>
          <div className="text-xs text-slate-600">{t.footerCopyright}</div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: HelpFeature) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-gold-500/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-gold-400 mt-0.5">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ number, title, steps }: { number: number; title: string; steps: string[] }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-sm font-bold">
          {number}
        </div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <ul className="space-y-1.5 pl-10">
        {steps.map(step => (
          <li key={step} className="text-sm text-slate-300 flex items-start gap-2">
            <span className="text-slate-500">•</span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleItem({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold mt-0.5">
        {num}
      </div>
      <div className="flex-1">
        <span className="text-white font-medium">{title}: </span>
        <span className="text-slate-300">{children}</span>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: HelpFaq) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
      <h4 className="text-sm font-medium text-white mb-1">{question}</h4>
      <p className="text-sm text-slate-400">{answer}</p>
    </div>
  );
}
