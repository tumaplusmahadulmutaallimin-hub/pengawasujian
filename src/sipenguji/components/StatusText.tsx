import { AlertCircle, CheckCircle2, Clock, Info } from 'lucide-react';

interface StatusTextProps {
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  label: string;
}

export function StatusText({ tone, label }: StatusTextProps) {
  const styles = {
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
    neutral: 'text-slate-600',
  }[tone];

  const Icon = {
    success: CheckCircle2,
    warning: Clock,
    danger: AlertCircle,
    neutral: Info,
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${styles}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
