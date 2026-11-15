import type {
  CheckInCreateInput,
  ContactCreateInput,
  PauseInput,
  RadarResponse,
  RadarScope,
  SessionUser,
  SimulationStarted,
  StudentCreateInput,
  StudentDetail,
  StudentUpdateInput,
  TeamMember,
  TimelineItem,
  WeeklyReport,
} from '@retention/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const issues = data?.issues as Array<{ message: string }> | undefined;
    const message = issues?.length ? issues.map((i) => i.message).join(' ') : data?.error;
    throw new ApiError(response.status, message ?? 'Não foi possível concluir a ação.');
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => request<SessionUser>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<SessionUser>('GET', '/api/auth/me'),

  radar: (scope?: RadarScope) => request<RadarResponse>('GET', `/api/radar${scope ? `?scope=${scope}` : ''}`),
  team: () => request<TeamMember[]>('GET', '/api/team'),
  latestReport: () => request<WeeklyReport | null>('GET', '/api/reports/latest'),
  simulateWeek: () => request<SimulationStarted>('POST', '/api/simulation/week'),

  student: (id: string) => request<StudentDetail>('GET', `/api/students/${id}`),
  timeline: (id: string) => request<TimelineItem[]>('GET', `/api/students/${id}/timeline?limit=80`),
  createStudent: (input: StudentCreateInput) => request<StudentDetail>('POST', '/api/students', input),
  updateStudent: (id: string, input: StudentUpdateInput) => request<StudentDetail>('PATCH', `/api/students/${id}`, input),
  archiveStudent: (id: string) => request<void>('DELETE', `/api/students/${id}`),
  checkIn: (id: string, input: CheckInCreateInput = {}) =>
    request<StudentDetail>('POST', `/api/students/${id}/check-ins`, input),
  contact: (id: string, input: ContactCreateInput) => request<StudentDetail>('POST', `/api/students/${id}/contacts`, input),
  completeFollowUp: (contactId: string) =>
    request<StudentDetail>('POST', `/api/contacts/${contactId}/follow-up/complete`),
  pause: (id: string, input: PauseInput) => request<StudentDetail>('POST', `/api/students/${id}/pause`, input),
  resume: (id: string) => request<StudentDetail>('POST', `/api/students/${id}/resume`),
};
