import { ChevronLeft, ChevronRight, FlaskConical, Play, Trophy, Users, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLanguagePreference } from '../../i18n/context';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDemo: () => void;
}

export function OnboardingModal({ isOpen, onClose, onLoadDemo }: OnboardingModalProps) {
  const { t } = useLanguagePreference();
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeClose(isOpen, onClose);
  useFocusTrap(isOpen, dialogRef);

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div className="rounded-xl bg-gold-500/15 p-3 text-gold-400">{current.icon}</div>
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label={t.close}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="mt-5 text-xl font-semibold text-white">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{current.description}</p>

        <div className="mt-6 flex justify-center gap-1.5">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setStep(index)}
              className={`h-1.5 rounded-full transition-all ${index === step ? 'w-7 bg-gold-400' : 'w-2 bg-slate-700'}`}
              aria-label={String(index + 1)}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
            {t.onboardingSkip}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {t.onboardingPrevious}
              </button>
            )}
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 rounded-lg bg-gold-500/20 px-3 py-2 text-xs font-medium text-gold-300 hover:bg-gold-500/30"
              >
                {t.onboardingNext}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={onLoadDemo}
                className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                {t.onboardingLoadDemo}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
