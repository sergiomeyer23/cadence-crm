import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_FREQUENCY_RULE,
  absenceToleranceDays,
  evaluateFrequency,
  resolveFrequencyRule,
  type FrequencyInput,
} from '../src';

const NOW = new Date('2026-11-15T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function input(overrides: Partial<FrequencyInput>): FrequencyInput {
  return {
    now: NOW,
    weeklyGoal: 3,
    trackingSince: daysAgo(90),
    paused: false,
    checkIns: [],
    ...overrides,
  };
}

describe('evaluateFrequency', () => {
  it('mantém ACTIVE quem cumpre a meta e treinou há pouco', () => {
    const result = evaluateFrequency(input({ checkIns: [13, 11, 9, 6, 4, 1].map(daysAgo) }));

    expect(result.status).toBe('ACTIVE');
    expect(result.reasons).toEqual([]);
    expect(result.checkInsInWindow).toBe(6);
    expect(result.expectedInWindow).toBe(6);
    expect(result.adherence).toBe(1);
  });

  it('vai para WARNING com aderência entre 30% e 60%', () => {
    const result = evaluateFrequency(input({ checkIns: [10, 6, 2].map(daysAgo) }));

    expect(result.adherence).toBe(0.5);
    expect(result.status).toBe('WARNING');
    expect(result.reasons).toEqual(['LOW_ADHERENCE']);
  });

  it('vai para AT_RISK com aderência abaixo de 30%', () => {
    const result = evaluateFrequency(input({ weeklyGoal: 4, checkIns: [5, 1].map(daysAgo) }));

    expect(result.adherence).toBe(0.25);
    expect(result.status).toBe('AT_RISK');
    expect(result.reasons).toEqual(['VERY_LOW_ADHERENCE']);
  });

  it('vai para WARNING quando a ausência passa da tolerância, mesmo com boa aderência', () => {
    // Meta 3: intervalo esperado de 2,33 dias, tolerância de 4,67 dias.
    const result = evaluateFrequency(input({ checkIns: [13, 11, 8, 5.5].map(daysAgo) }));

    expect(result.adherence).toBeGreaterThanOrEqual(0.6);
    expect(result.absenceToleranceDays).toBeCloseTo(14 / 3);
    expect(result.status).toBe('WARNING');
    expect(result.reasons).toEqual(['ABSENCE']);
  });

  it('vai para AT_RISK quando a ausência passa do dobro da tolerância', () => {
    const result = evaluateFrequency(input({ checkIns: [13, 12, 11, 10].map(daysAgo) }));

    expect(result.daysAbsent).toBe(10);
    expect(result.status).toBe('AT_RISK');
    expect(result.reasons).toContain('LONG_ABSENCE');
  });

  it('fica com o pior dos dois sinais', () => {
    const result = evaluateFrequency(input({ checkIns: [daysAgo(12)] }));

    expect(result.status).toBe('AT_RISK');
    expect(result.reasons).toEqual(['VERY_LOW_ADHERENCE', 'LONG_ABSENCE']);
  });

  it('ignora check-ins no futuro', () => {
    const result = evaluateFrequency(input({ checkIns: [daysAgo(1), daysAgo(-2)] }));

    expect(result.checkInsInWindow).toBe(1);
    expect(result.daysAbsent).toBe(1);
  });

  describe('piso da tolerância de ausência', () => {
    it('não deixa a tolerância ficar abaixo de 4 dias para metas altas', () => {
      expect(absenceToleranceDays(7)).toBe(DEFAULT_FREQUENCY_RULE.absenceFloorDays);
      expect(absenceToleranceDays(6)).toBe(4);
    });

    it('mantém ACTIVE quem treina quase todo dia e faltou 3 dias', () => {
      const checkIns = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(daysAgo);
      const withFloor = evaluateFrequency(input({ weeklyGoal: 6, checkIns }));
      const withoutFloor = evaluateFrequency(
        input({ weeklyGoal: 6, checkIns }),
        resolveFrequencyRule({ absenceFloorDays: 1 }),
      );

      expect(withFloor.status).toBe('ACTIVE');
      expect(withoutFloor.status).toBe('WARNING');
      expect(withoutFloor.reasons).toEqual(['ABSENCE']);
    });
  });

  describe('teto da tolerância de ausência', () => {
    it('não deixa a tolerância passar de 10 dias para metas baixas', () => {
      expect(absenceToleranceDays(1)).toBe(DEFAULT_FREQUENCY_RULE.absenceCeilingDays);
    });

    it('avisa quem treina uma vez por semana e está há 11 dias sem vir', () => {
      const checkIns = [13, 11].map(daysAgo);
      const withCeiling = evaluateFrequency(input({ weeklyGoal: 1, checkIns }));
      const withoutCeiling = evaluateFrequency(
        input({ weeklyGoal: 1, checkIns }),
        resolveFrequencyRule({ absenceCeilingDays: 30 }),
      );

      expect(withCeiling.adherence).toBe(1);
      expect(withCeiling.status).toBe('WARNING');
      expect(withCeiling.reasons).toEqual(['ABSENCE']);
      expect(withoutCeiling.status).toBe('ACTIVE');
    });
  });

  describe('aluno novo', () => {
    it('não cobra aderência nos primeiros 7 dias', () => {
      const result = evaluateFrequency(input({ trackingSince: daysAgo(3) }));

      expect(result.status).toBe('ACTIVE');
      expect(result.reasons).toEqual(['NEW_STUDENT']);
      expect(result.adherence).toBeNull();
      expect(result.expectedInWindow).toBeNull();
    });

    it('conta a ausência desde a matrícula e chega no máximo a WARNING no início', () => {
      const result = evaluateFrequency(input({ trackingSince: daysAgo(6) }));

      expect(result.daysAbsent).toBe(6);
      expect(result.status).toBe('WARNING');
      expect(result.reasons).toEqual(['NEW_STUDENT', 'ABSENCE']);
    });

    it('usa só os dias desde a matrícula como janela', () => {
      const result = evaluateFrequency(input({ trackingSince: daysAgo(10), checkIns: [9, 5, 1].map(daysAgo) }));

      expect(result.windowDays).toBe(10);
      expect(result.expectedInWindow).toBeCloseTo(30 / 7);
      expect(result.status).toBe('ACTIVE');
    });

    it('vai para AT_RISK se passou do período inicial sem nenhum treino', () => {
      const result = evaluateFrequency(input({ trackingSince: daysAgo(10) }));

      expect(result.status).toBe('AT_RISK');
    });
  });

  describe('pausa por lesão', () => {
    it('fica em PAUSED_INJURY sem avaliar frequência', () => {
      const result = evaluateFrequency(input({ paused: true, checkIns: [daysAgo(40)] }));

      expect(result.status).toBe('PAUSED_INJURY');
      expect(result.reasons).toEqual(['PAUSED']);
      expect(result.adherence).toBeNull();
    });

    it('recomeça a contagem na retomada e ignora os treinos de antes da pausa', () => {
      const result = evaluateFrequency(input({ trackingSince: daysAgo(2), checkIns: [40, 38, 35].map(daysAgo) }));

      expect(result.checkInsInWindow).toBe(0);
      expect(result.daysAbsent).toBe(2);
      expect(result.status).toBe('ACTIVE');
      expect(result.reasons).toEqual(['NEW_STUDENT']);
    });
  });
});

describe('resolveFrequencyRule', () => {
  it('aplica ajustes parciais sobre o padrão', () => {
    const config = resolveFrequencyRule({ windowDays: 21 });

    expect(config.windowDays).toBe(21);
    expect(config.absenceFloorDays).toBe(DEFAULT_FREQUENCY_RULE.absenceFloorDays);
  });

  it('recusa piso maior que o teto', () => {
    expect(() => resolveFrequencyRule({ absenceFloorDays: 12, absenceCeilingDays: 10 })).toThrow();
  });
});
