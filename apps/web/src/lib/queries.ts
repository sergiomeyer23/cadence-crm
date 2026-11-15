import type { RadarScope } from '@retention/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** O quadro consulta a API a cada 3 s para refletir o que o worker gravou. */
export const POLL_MS = 3_000;

export const keys = {
  me: ['me'] as const,
  radar: (scope?: RadarScope) => ['radar', scope ?? 'default'] as const,
  student: (id: string) => ['student', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
  team: ['team'] as const,
  report: ['report'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, retry: false });
}

export function useRadar(scope?: RadarScope) {
  return useQuery({ queryKey: keys.radar(scope), queryFn: () => api.radar(scope), refetchInterval: POLL_MS });
}

export function useStudent(id: string | null) {
  return useQuery({
    queryKey: keys.student(id ?? ''),
    queryFn: () => api.student(id!),
    enabled: id !== null,
    refetchInterval: POLL_MS,
  });
}

export function useTimeline(id: string | null) {
  return useQuery({
    queryKey: keys.timeline(id ?? ''),
    queryFn: () => api.timeline(id!),
    enabled: id !== null,
    refetchInterval: POLL_MS,
  });
}

export function useTeam() {
  return useQuery({ queryKey: keys.team, queryFn: api.team, staleTime: 60_000 });
}

export function useLatestReport() {
  return useQuery({ queryKey: keys.report, queryFn: api.latestReport, refetchInterval: 5_000 });
}

/** Mutação que, ao terminar, atualiza o quadro e a gaveta do aluno afetado. */
export function useStudentMutation<TInput, TResult>(
  studentId: string | null,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['radar'] }),
        studentId ? client.invalidateQueries({ queryKey: keys.student(studentId) }) : null,
        studentId ? client.invalidateQueries({ queryKey: keys.timeline(studentId) }) : null,
      ]);
    },
  });
}
