import { cn } from '@/lib/utils';

export const BRAND_NAME = 'Cadence CRM';
export const BRAND_SUBTITLE = 'Radar de Retenção & Automação de Frequência';

/** Mesmo desenho do favicon: arco de radar com o pulso de frequência. */
export function CadenceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={cn('size-9 shrink-0', className)}>
      <rect width="64" height="64" rx="16" fill="#090D16" />
      <path d="M14 32a18 18 0 0 1 36 0" stroke="#1F2937" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 32a18 18 0 0 1 28.5-14.5" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M12 38h10l5-12 7 20 6-14 4 6h8"
        stroke="#10B981"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="52" cy="38" r="3.5" fill="#F43F5E" />
    </svg>
  );
}
