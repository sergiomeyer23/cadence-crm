import type { RetentionStatus } from '@retention/shared';
import { Activity, Bandage, Siren, TriangleExclamationPoint, type LucideIcon } from 'lucide-react';

interface StatusStyle {
  title: string;
  hint: string;
  icon: LucideIcon;
  column: string;
  accent: string;
  badge: string;
}

export const STATUS_STYLE: Record<RetentionStatus, StatusStyle> = {
  ACTIVE: {
    title: 'Ativos',
    hint: 'Treinando dentro do combinado',
    icon: Activity,
    column: 'bg-emerald-50/70 border-emerald-100',
    accent: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  WARNING: {
    title: 'Atenção',
    hint: 'A frequência começou a cair',
    icon: TriangleExclamationPoint,
    column: 'bg-amber-50/70 border-amber-100',
    accent: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  AT_RISK: {
    title: 'Em risco',
    hint: 'Vale um contato hoje',
    icon: Siren,
    column: 'bg-rose-50/70 border-rose-100',
    accent: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  PAUSED_INJURY: {
    title: 'Pausa por lesão',
    hint: 'Fora da avaliação até retomar',
    icon: Bandage,
    column: 'bg-sky-50/70 border-sky-100',
    accent: 'text-sky-700',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
  },
};
