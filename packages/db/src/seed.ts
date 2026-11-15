import {
  DAY_MS,
  DEFAULT_FREQUENCY_RULE,
  addDaysToLocalDate,
  evaluateFrequency,
  startOfLocalDay,
  toLocalDate,
  type ContactChannel,
  type RetentionStatus,
  type SimProfile,
  type WorkspaceKind,
} from '@retention/shared';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from './client';
import { hashPassword } from './passwords';
import {
  checkIns,
  contacts,
  students,
  timelineEvents,
  users,
  workspaces,
  type NewStudent,
  type NewTimelineEvent,
} from './schema';
import { attendanceProbability, planCheckIns, seededRng, type Rng } from './simulation';
import { timelineEvent } from './timeline';

export const DEMO_PASSWORD = 'demo1234';

interface ContactSeed {
  daysAgo: number;
  channel: ContactChannel;
  note: string;
  /** Dias a partir de hoje; negativo significa follow-up atrasado. */
  followUpInDays?: number;
  followUpDone?: boolean;
}

interface StudentSeed {
  name: string;
  goal: number;
  profile: SimProfile;
  coach: string;
  enrolledDaysAgo: number;
  paused?: { daysAgo: number; reason: string };
  notes?: string;
  contact?: ContactSeed;
}

interface WorkspaceSeed {
  name: string;
  kind: WorkspaceKind;
  team: Array<{ key: string; name: string; email: string; role: 'OWNER' | 'COACH' }>;
  students: StudentSeed[];
}

const s = (
  name: string,
  goal: number,
  profile: SimProfile,
  coach: string,
  enrolledDaysAgo: number,
  extra: Partial<StudentSeed> = {},
): StudentSeed => ({ name, goal, profile, coach, enrolledDaysAgo, ...extra });

const GYM: WorkspaceSeed = {
  name: 'Academia Ritmo',
  kind: 'GYM',
  team: [
    { key: 'helena', name: 'Helena Prado', email: 'helena@ritmo.test', role: 'OWNER' },
    { key: 'rafael', name: 'Rafael Monteiro', email: 'rafael@ritmo.test', role: 'COACH' },
    { key: 'patricia', name: 'Patrícia Nunes', email: 'patricia@ritmo.test', role: 'COACH' },
  ],
  students: [
    s('Ana Beatriz Rocha', 3, 'STEADY', 'rafael', 210, { notes: 'Prefere treinar antes do trabalho, por volta das 6h.' }),
    s('Lucas Ferreira', 4, 'STEADY', 'rafael', 160),
    s('Mariana Oliveira', 3, 'STEADY', 'rafael', 95),
    s('Gabriel Santos', 5, 'STEADY', 'rafael', 300, { notes: 'Treina para a meia maratona de abril.' }),
    s('Juliana Ribeiro', 2, 'STEADY', 'rafael', 70),
    s('Pedro Henrique Lima', 3, 'IRREGULAR', 'rafael', 130),
    s('Larissa Carvalho', 4, 'DRIFTING', 'rafael', 180),
    s('Matheus Gomes', 3, 'STEADY', 'rafael', 45),
    s('Beatriz Almeida', 3, 'STEADY', 'rafael', 4, { notes: 'Primeira academia. Ainda pegando o ritmo.' }),
    s('Felipe Araújo', 4, 'IRREGULAR', 'rafael', 240),
    s('Fernanda Castro', 3, 'STEADY', 'rafael', 400, { paused: { daysAgo: 9, reason: 'Entorse no tornozelo' } }),
    s('Gustavo Pereira', 3, 'GHOST', 'rafael', 120),
    s('Isabela Martins', 2, 'STEADY', 'rafael', 60),
    s('Rodrigo Barbosa', 3, 'GHOST', 'rafael', 200, {
      contact: {
        daysAgo: 2,
        channel: 'WHATSAPP',
        note: 'Mudou para o turno da noite no trabalho. Combinamos de testar o horário das 6h.',
        followUpInDays: 3,
      },
    }),
    s('Letícia Moura', 3, 'STEADY', 'rafael', 85),
    s('Vinícius Teixeira', 5, 'DRIFTING', 'rafael', 150),
    s('Amanda Correia', 3, 'STEADY', 'rafael', 33),
    s('Leonardo Dias', 2, 'IRREGULAR', 'rafael', 110),
    s('Natália Freitas', 3, 'STEADY', 'patricia', 260),
    s('Eduardo Pinto', 4, 'STEADY', 'patricia', 190),
    s('Carolina Mendes', 3, 'IRREGULAR', 'patricia', 140, {
      contact: {
        daysAgo: 6,
        channel: 'IN_PERSON',
        note: 'Sentiu o joelho depois do agachamento. Troquei por leg press e combinamos de reavaliar.',
        followUpInDays: -2,
        followUpDone: true,
      },
    }),
    s('Thiago Cardoso', 3, 'STEADY', 'patricia', 75),
    s('Bianca Lopes', 4, 'STEADY', 'patricia', 55),
    s('André Vieira', 3, 'DRIFTING', 'patricia', 230),
    s('Priscila Ramos', 2, 'STEADY', 'patricia', 100),
    s('Daniel Fernandes', 3, 'STEADY', 'patricia', 330, { paused: { daysAgo: 20, reason: 'Dor lombar, em fisioterapia' } }),
    s('Aline Batista', 3, 'GHOST', 'patricia', 5, { notes: 'Matrícula pelo plano anual.' }),
    s('Ricardo Moreira', 4, 'STEADY', 'patricia', 280),
    s('Tatiane Cunha', 3, 'IRREGULAR', 'patricia', 90),
    s('Marcelo Azevedo', 3, 'STEADY', 'patricia', 125),
    s('Vanessa Rezende', 3, 'GHOST', 'patricia', 170, {
      contact: {
        daysAgo: 12,
        channel: 'PHONE',
        note: 'Não atendeu. Deixei recado com a recepção para retornar.',
        followUpInDays: -4,
      },
    }),
    s('Caio Nascimento', 5, 'STEADY', 'patricia', 210),
    s('Renata Farias', 2, 'STEADY', 'patricia', 40),
    s('Fábio Guimarães', 3, 'IRREGULAR', 'patricia', 155),
    s('Sofia Brandão', 3, 'STEADY', 'patricia', 65),
    s('João Victor Macedo', 4, 'STEADY', 'patricia', 20),
    s('Débora Pacheco', 3, 'STEADY', 'helena', 500, { notes: 'Aluna desde a inauguração.' }),
    s('Otávio Siqueira', 3, 'DRIFTING', 'helena', 145),
    s('Luana Medeiros', 2, 'IRREGULAR', 'helena', 80),
    s('Henrique Bastos', 3, 'STEADY', 'helena', 115),
  ],
};

const SOLO: WorkspaceSeed = {
  name: 'Marcos Vilela Personal',
  kind: 'SOLO',
  team: [{ key: 'marcos', name: 'Marcos Vilela', email: 'marcos@personal.test', role: 'OWNER' }],
  students: [
    s('Cláudia Torres', 3, 'STEADY', 'marcos', 220),
    s('Roberto Saldanha', 2, 'STEADY', 'marcos', 140, { notes: 'Atende em casa, condomínio no Morumbi.' }),
    s('Elaine Furtado', 3, 'IRREGULAR', 'marcos', 90),
    s('Sérgio Quintana', 4, 'STEADY', 'marcos', 300),
    s('Paula Drummond', 3, 'DRIFTING', 'marcos', 160),
    s('Alexandre Coutinho', 2, 'GHOST', 'marcos', 110, {
      contact: {
        daysAgo: 8,
        channel: 'WHATSAPP',
        note: 'Viagem a trabalho. Disse que volta na semana que vem.',
        followUpInDays: 1,
      },
    }),
    s('Mônica Leite', 3, 'STEADY', 'marcos', 75),
    s('Fernando Prates', 2, 'STEADY', 'marcos', 35),
  ],
};

/** Seis semanas de histórico bastam para cobrir a janela da regra com folga. */
const HISTORY_WEEKS = 6;

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function phone(rng: Rng): string {
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');
  return `(11) 9${digits(4)}-${digits(4)}`;
}

function historyFor(seed: StudentSeed, enrolledAt: Date, pausedAt: Date | null, now: Date, rng: Rng): Date[] {
  const result: Date[] = [];
  for (let week = HISTORY_WEEKS; week >= 1; week--) {
    const weekEnd = new Date(now.getTime() - (week - 1) * 7 * DAY_MS);
    const from = new Date(Math.max(now.getTime() - week * 7 * DAY_MS, enrolledAt.getTime()));
    const to = pausedAt && pausedAt < weekEnd ? pausedAt : weekEnd;
    if (to <= from) continue;
    // Quem hoje some da academia costumava treinar até umas três semanas atrás.
    const profile = seed.profile === 'GHOST' && week > 3 ? 'STEADY' : seed.profile;
    const probability = attendanceProbability(profile, 0, false, rng);
    result.push(...planCheckIns({ from, to, weeklyGoal: seed.goal, probability, rng }));
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Reavalia o aluno ao fim de cada dia do histórico para registrar as mudanças
 * de status na timeline e chegar ao status atual pelo mesmo caminho do worker.
 */
function replayStatus(
  base: { workspaceId: string; studentId: string },
  weeklyGoal: number,
  enrolledAt: Date,
  pausedAt: Date | null,
  history: Date[],
  now: Date,
): { status: RetentionStatus; changedAt: Date; events: NewTimelineEvent[] } {
  // O replay começa quando a janela da regra já está coberta pelo histórico
  // gerado; antes disso o aluno é considerado ativo.
  const historyStart = now.getTime() - (HISTORY_WEEKS * 7 - DEFAULT_FREQUENCY_RULE.windowDays) * DAY_MS;
  const replayStart = new Date(Math.max(enrolledAt.getTime(), historyStart));
  let status: RetentionStatus = 'ACTIVE';
  let changedAt = replayStart;
  const events: NewTimelineEvent[] = [];

  const checkpoints: Date[] = [];
  let day = toLocalDate(replayStart);
  for (;;) {
    day = addDaysToLocalDate(day, 1);
    const checkpoint = new Date(startOfLocalDay(day).getTime() - 60_000);
    if (checkpoint >= now) break;
    checkpoints.push(checkpoint);
  }
  checkpoints.push(now);

  for (const at of checkpoints) {
    const evaluation = evaluateFrequency({
      now: at,
      weeklyGoal,
      trackingSince: enrolledAt,
      paused: pausedAt !== null && pausedAt <= at,
      checkIns: history.filter((c) => c <= at),
    });
    if (evaluation.status === status) continue;
    events.push(
      timelineEvent(
        'STATUS_CHANGED',
        { ...base, occurredAt: at },
        {
          from: status,
          to: evaluation.status,
          reasons: evaluation.reasons,
          adherence: evaluation.adherence,
          daysAbsent: Math.round(evaluation.daysAbsent * 10) / 10,
        },
      ),
    );
    status = evaluation.status;
    changedAt = at;
  }

  return { status, changedAt, events };
}

async function seedWorkspace(db: Db, def: WorkspaceSeed, passwordHash: string, now: Date, rng: Rng) {
  const [workspace] = await db.insert(workspaces).values({ name: def.name, kind: def.kind }).returning();
  if (!workspace) throw new Error('Falha ao criar workspace');

  const team = await db
    .insert(users)
    .values(def.team.map((m) => ({ workspaceId: workspace.id, name: m.name, email: m.email, role: m.role, passwordHash })))
    .returning();
  const userByKey = new Map(def.team.map((m, i) => [m.key, team[i]!]));

  const studentRows: NewStudent[] = [];
  const checkInRows: (typeof checkIns.$inferInsert)[] = [];
  const contactRows: (typeof contacts.$inferInsert)[] = [];
  const eventRows: NewTimelineEvent[] = [];

  for (const seed of def.students) {
    const id = randomUUID();
    const coach = userByKey.get(seed.coach);
    const startedOn = toLocalDate(new Date(now.getTime() - seed.enrolledDaysAgo * DAY_MS));
    const enrolledAt = new Date(startOfLocalDay(startedOn).getTime() + 9 * 3_600_000);
    const pausedAt = seed.paused ? new Date(now.getTime() - seed.paused.daysAgo * DAY_MS) : null;
    const base = { workspaceId: workspace.id, studentId: id };

    const history = historyFor(seed, enrolledAt, pausedAt, now, rng);
    const replay = replayStatus(base, seed.goal, enrolledAt, pausedAt, history, now);

    studentRows.push({
      id,
      workspaceId: workspace.id,
      coachId: coach?.id ?? null,
      name: seed.name,
      email: rng() < 0.6 ? `${slug(seed.name)}@email.test` : null,
      phone: phone(rng),
      notes: seed.notes ?? null,
      weeklyGoal: seed.goal,
      startedOn,
      trackingSince: enrolledAt,
      status: replay.status,
      statusChangedAt: replay.changedAt,
      pausedAt,
      pauseReason: seed.paused?.reason ?? null,
      simProfile: seed.profile,
    });

    eventRows.push(timelineEvent('ENROLLED', { ...base, occurredAt: enrolledAt, actorId: coach?.id }, { weeklyGoal: seed.goal }));

    for (const occurredAt of history) {
      const checkInId = randomUUID();
      checkInRows.push({ id: checkInId, ...base, occurredAt, source: 'SEED' });
      eventRows.push(timelineEvent('CHECK_IN', { ...base, occurredAt }, { checkInId, source: 'SEED' }));
    }

    if (pausedAt && seed.paused) {
      eventRows.push(timelineEvent('PAUSED', { ...base, occurredAt: pausedAt, actorId: coach?.id }, { reason: seed.paused.reason }));
    }
    eventRows.push(...replay.events);

    if (seed.contact) {
      const contactId = randomUUID();
      const contactedAt = new Date(now.getTime() - seed.contact.daysAgo * DAY_MS);
      const followUpOn =
        seed.contact.followUpInDays === undefined ? null : addDaysToLocalDate(toLocalDate(now), seed.contact.followUpInDays);
      const doneAt = seed.contact.followUpDone && followUpOn ? startOfLocalDay(followUpOn) : null;
      contactRows.push({
        id: contactId,
        ...base,
        userId: coach?.id ?? null,
        channel: seed.contact.channel,
        note: seed.contact.note,
        contactedAt,
        followUpOn,
        followUpDoneAt: doneAt,
      });
      eventRows.push(
        timelineEvent(
          'CONTACT',
          { ...base, occurredAt: contactedAt, actorId: coach?.id },
          { contactId, channel: seed.contact.channel, note: seed.contact.note, followUpOn },
        ),
      );
      if (doneAt) {
        eventRows.push(timelineEvent('FOLLOW_UP_DONE', { ...base, occurredAt: doneAt, actorId: coach?.id }, { contactId }));
      }
    }
  }

  await db.insert(students).values(studentRows);
  if (checkInRows.length) await db.insert(checkIns).values(checkInRows);
  if (contactRows.length) await db.insert(contacts).values(contactRows);
  for (let i = 0; i < eventRows.length; i += 500) {
    await db.insert(timelineEvents).values(eventRows.slice(i, i + 500));
  }

  return { workspace, students: studentRows.length, checkIns: checkInRows.length };
}

/** Apaga tudo e recria as duas contas de demonstração. */
export async function seedDatabase(db: Db, options: { now?: Date; seed?: number } = {}) {
  const now = options.now ?? new Date();
  const rng = seededRng(options.seed ?? 20261115);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.execute(
    sql`TRUNCATE TABLE weekly_reports, timeline_events, contacts, check_ins, students, sessions, users, workspaces CASCADE`,
  );

  const gym = await seedWorkspace(db, GYM, passwordHash, now, rng);
  const solo = await seedWorkspace(db, SOLO, passwordHash, now, rng);
  return { gym, solo };
}
