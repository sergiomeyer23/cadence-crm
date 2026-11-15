# Retention Gym CRM

CRM de retenção para academias e personal trainers. A partir dos check-ins, o Radar separa os alunos em quatro colunas: quem treina dentro do combinado, quem começou a faltar, quem precisa de contato e quem está pausado por lesão. A equipe registra contatos e follow-ups na própria ficha do aluno.

Esta é a versão 1.0. Cobrança, ficha de treino, app mobile, integração com catraca e envio real de mensagens ficaram de fora.

## Como rodar

Você precisa de Node 22 ou mais novo, pnpm 10 e Docker.

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

O `pnpm dev` sobe a API, o worker e a web juntos. Depois disso:

- Web: http://localhost:5173
- API: http://localhost:3333 (a web chega nela pelo proxy do Vite, em `/api`)
- Bull Board: http://localhost:5173/admin/queues, com o usuário e a senha de `BULL_BOARD_USER` e `BULL_BOARD_PASSWORD`

O seed cria duas contas de exemplo, todas com a senha `demo1234`:

| E-mail | Quem é |
| --- | --- |
| helena@ritmo.test | Dona da Academia Ritmo (40 alunos) |
| rafael@ritmo.test | Treinador da Academia Ritmo |
| patricia@ritmo.test | Treinadora da Academia Ritmo |
| marcos@personal.test | Personal autônomo (8 alunos) |

Rodar `pnpm db:seed` de novo apaga tudo e recria esses dados, inclusive o relógio simulado.

### Testes e build

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

Os testes do worker usam o banco `retention_gym_test`, criado pelo `docker/postgres/init.sql` na primeira vez que o Postgres sobe. Se o volume já existia antes desse arquivo, crie o banco à mão:

```bash
docker compose exec postgres createdb -U retention retention_gym_test
```

## Arquitetura

```
apps/api         Fastify: sessão, alunos, contatos, Radar, simulação, Bull Board
apps/worker      BullMQ: simulate-checkins, retention-analysis, weekly-report
apps/web         React, Vite, Tailwind e shadcn/ui
packages/shared  Schemas Zod, tipos e a regra de frequência
packages/db      Schema Drizzle, migrations, seed e o serviço de análise de retenção
```

A sessão fica num cookie httpOnly; no banco guardamos só o hash do token. Toda consulta da API filtra pelo `workspace_id` do usuário logado, e um ID de outro workspace responde 404.

O status do aluno só muda pelo serviço `runRetentionAnalysis`, em `packages/db/src/retention.ts`. O worker roda esse serviço para todos os alunos a cada 60 segundos e logo depois de cada simulação. A API chama o mesmo serviço só para o aluno afetado depois de um check-in, de uma pausa ou de uma retomada, para o card mudar de coluna na hora. O evento `STATUS_CHANGED` só é gravado quando o status muda. O UPDATE é condicionado ao status lido antes, então duas análises simultâneas não duplicam o evento.

Cada workspace tem um relógio próprio (`clock_offset_days`). "Simular semana de treinos" adianta esse relógio em 7 dias e gera os treinos da semana conforme o perfil de cada aluno. Check-ins, contatos, timeline e regra usam esse relógio, então a simulação de uma academia não afeta as outras.

O `weekly-report` roda toda segunda às 8h (configurável em `WEEKLY_REPORT_CRON`) e também depois de cada semana simulada. Ele grava um resumo por workspace com treinos, contatos, quem voltou para Ativo, quem entrou em risco e quem está em risco sem contato. Rodar de novo no mesmo dia só atualiza o resumo.

## Regra de frequência

A regra é uma função pura em `packages/shared/src/frequency-rule.ts`, com testes em `packages/shared/test`. Ela olha dois sinais e fica com o pior.

O primeiro é a aderência: treinos feitos nos últimos 14 dias divididos pelos treinos esperados (meta semanal × 14 ÷ 7). Abaixo de 60% o aluno vai para WARNING; abaixo de 30%, para AT_RISK.

O segundo é a ausência. A tolerância é o dobro do intervalo esperado entre treinos (7 ÷ meta), com piso de 4 dias e teto de 10. Quem passa da tolerância vai para WARNING, e quem passa do dobro dela vai para AT_RISK. Com meta de 3 treinos por semana, a tolerância é de 4,7 dias e o risco começa em 9,3 dias sem treinar. O piso evita que quem treina todo dia seja marcado por faltar dois dias; o teto evita esperar duas semanas por quem treina uma vez por semana.

Aluno pausado por lesão fica em PAUSED_INJURY e não é avaliado. Nos primeiros 7 dias após a matrícula só a ausência conta, medida desde a matrícula. Até completar 14 dias de casa, a janela da aderência é o número de dias desde a matrícula. Ao retomar de uma pausa, o acompanhamento recomeça na data da retomada e o aluno passa pelo mesmo período inicial.

| Constante | Padrão |
| --- | --- |
| `windowDays` | 14 |
| `warningAdherence` | 0.6 |
| `riskAdherence` | 0.3 |
| `absenceFactor` | 2 |
| `absenceFloorDays` | 4 |
| `absenceCeilingDays` | 10 |
| `riskAbsenceFactor` | 2 |
| `newStudentDays` | 7 |

Para mudar algum valor sem mexer no código, use `FREQUENCY_RULE_OVERRIDES` no `.env`, por exemplo `{"windowDays":21}`. A API e o worker leem a mesma variável.

## Como demonstrar ao vivo

1. Rode `pnpm db:seed` para começar do zero e deixe o `pnpm dev` no ar.
2. Entre como Helena (`helena@ritmo.test`). Em modo de desenvolvimento a tela de login mostra as contas de exemplo; basta clicar e entrar.
3. Mostre as quatro colunas. Cada card traz quantos treinos o aluno fez dos esperados e há quantos dias não aparece. Vanessa Rezende está com o follow-up atrasado.
4. Abra Gustavo Pereira, na coluna Em risco. A gaveta mostra aderência, dias sem treinar, o motivo do status e a timeline. Registre um contato por WhatsApp com follow-up para daqui a alguns dias.
5. Clique em "Simular semana de treinos". O botão fica em "Simulando semana...", o worker adianta o relógio em 7 dias, gera os treinos e roda a análise. Em poucos segundos alguns cards trocam de coluna e ficam destacados com "Veio de ...". A data no cabeçalho avança uma semana e aparece o relatório da semana no topo.
6. O sorteio dos treinos muda a cada execução, mas o padrão se repete. Quem recebeu contato recente costuma voltar a treinar. Os alunos em queda (Larissa Carvalho, Vinícius Teixeira, André Vieira, Otávio Siqueira) descem para Atenção e depois para Em risco. Aline Batista, matriculada há poucos dias e que nunca apareceu, vai para Em risco.
7. Abra um aluno que mudou de coluna e mostre na timeline a mudança de status com o motivo.
8. Pause alguém por lesão: o card vai na hora para Pausa por lesão. Ao retomar, ele volta como aluno em período inicial.
9. Alterne entre "Meus alunos" e "Toda a academia". Entre como Rafael para ver a visão de um treinador (sem o botão de simulação) e como Marcos para ver a de um personal autônomo, que não tem o filtro.
10. Em `/admin/queues`, o Bull Board mostra os três jobs. O resultado de cada `retention-analysis` lista quais alunos mudaram de status.

## Limitações conhecidas

- O fuso é fixo em America/Sao_Paulo (-03:00).
- O relógio simulado só anda para frente. Para voltar ao início, rode o seed de novo.
- O perfil de comportamento usado na simulação (`sim_profile`) é definido no seed. Alunos cadastrados pela tela entram como irregulares.
- O Bull Board usa uma credencial única de operação, separada dos usuários das academias, porque mostra jobs de todos os workspaces.
