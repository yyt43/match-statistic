import { ChevronLeft, ChevronRight, FlaskConical, Play, Trophy, Users, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDemo: () => void;
  /** 当前已有赛事（存档或内存中），加载示例赛事会覆盖它，需要二次确认。 */
  hasExistingEvent?: boolean;
}

export function OnboardingModal({
  isOpen,
  onClose,
  onLoadDemo,
  hasExistingEvent = false,
}: OnboardingModalProps) {
  const { t, language } = useLanguagePreference();
  const isEnglish = language === 'en';
  const [step, setStep] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscapeClose(isOpen, () => {
    if (confirmReplace) {
      setConfirmReplace(false);
      return;
    }
    onClose();
  });
  useFocusTrap(isOpen, dialogRef);

  useEffect(() => {
    if (!isOpen) setConfirmReplace(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const steps = [
    {
      icon: <Users className="h-7 w-7" />,
      title: t.onboardingPlayersTitle,
      description: t.onboardingPlayersDesc,
    },
    {
      icon: <Trophy className="h-7 w-7" />,
      title: t.onboardingRankingTitle,
      description: t.onboardingRankingDesc,
    },
    {
      icon: <Play className="h-7 w-7" />,
      title: t.onboardingFlowTitle,
      description: t.onboardingFlowDesc,
    },
    {
      icon: <FlaskConical className="h-7 w-7" />,
      title: t.onboardingDemoTitle,
      description: t.onboardingDemoDesc,
    },
  ];
  const current = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div className="rounded-xl bg-gold-500/15 p-3 text-gold-400" aria-hidden="true">{current.icon}</div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
            aria-label={t.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 id={titleId} className="mt-5 text-xl font-semibold text-white">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{current.description}</p>

        {isLastStep && hasExistingEvent && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-300"
          >
            {isEnglish
              ? 'Loading the sample event replaces the current event and its match history. This cannot be undone.'
              : '加载示例赛事会替换当前赛事及其比赛记录，且无法撤销。'}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-1.5">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setStep(index)}
              className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 ${index === step ? 'w-7 bg-gold-400' : 'w-2 bg-slate-700'}`}
              aria-label={isEnglish ? `Go to step ${index + 1}` : `跳到第 ${index + 1} 步`}
              aria-current={index === step ? 'step' : undefined}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60">
            {t.onboardingSkip}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t.onboardingPrevious}
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 rounded-lg bg-gold-500/20 px-3 py-2 text-xs font-medium text-gold-300 hover:bg-gold-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
              >
                {t.onboardingNext}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : confirmReplace ? (
              <div className="flex items-center gap-2" role="group" aria-label={isEnglish ? 'Confirm replacing event' : '确认替换赛事'}>
                <button
                  onClick={() => setConfirmReplace(false)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={() => {
                    setConfirmReplace(false);
                    onLoadDemo();
                  }}
                  className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                >
                  {isEnglish ? 'Replace and load' : '替换并加载'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (hasExistingEvent) {
                    setConfirmReplace(true);
                    return;
                  }
                  onLoadDemo();
                }}
                className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              >
                {hasExistingEvent
                  ? isEnglish
                    ? 'Load sample event (replaces current event)'
                    : '加载示例赛事（替换当前赛事）'
                  : t.onboardingLoadDemo}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
