import { formatLocalDate, plural } from '@/lib/format';
import { useLatestReport } from '@/lib/queries';
import { FileChartColumn } from 'lucide-react';

export function ReportStrip({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: report } = useLatestReport();
  if (!report) return null;
  const { data } = report;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-medium">
        <FileChartColumn className="size-4 text-muted-foreground" />
        Relatório de {formatLocalDate(report.periodStart)} a {formatLocalDate(report.periodEnd)}
      </span>
      <span>{plural(data.checkIns, 'treino', 'treinos')}</span>
      <span>{plural(data.contacts, 'contato', 'contatos')}</span>
      <span className="text-emerald-700">{plural(data.recovered, 'aluno voltou', 'alunos voltaram')} para Ativo</span>
      <span className="text-rose-700">{plural(data.movedToRisk, 'entrou', 'entraram')} em risco</span>
      {data.atRiskWithoutContact.length > 0 && (
        <span className="text-muted-foreground">
          Em risco e sem contato na semana:{' '}
          {data.atRiskWithoutContact.map((student, index) => (
            <span key={student.id}>
              {index > 0 && ', '}
              <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => onOpen(student.id)}>
                {student.name}
              </button>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
