/*
 * Cadence CRM: formulário de captura de leads para o site da academia.
 *
 * Uso:
 *   <script src="https://SEU-DOMINIO-CADENCE/embed/cadence-widget.js" defer></script>
 *   <cadence-lead-widget workspace-id="ID-DA-ACADEMIA"></cadence-lead-widget>
 *
 * Atributos opcionais:
 *   heading   título do formulário
 *   source    origem do lead quando a URL não tem utm_source
 *   api-base  endereço da API; por padrão, o mesmo domínio de onde o script foi carregado
 *
 * Variáveis de CSS aceitas no elemento: --cadence-accent, --cadence-radius, --cadence-font.
 * Ao enviar com sucesso, dispara o evento "cadence:lead-submitted" (bubbles e composed).
 */
(function () {
  'use strict';

  if (window.customElements.get('cadence-lead-widget')) return;

  // document.currentScript só existe enquanto o script executa, então guardamos agora.
  var scriptOrigin = document.currentScript
    ? new URL(document.currentScript.src, window.location.href).origin
    : window.location.origin;

  var STYLE = [
    ':host { display: block; font-family: var(--cadence-font, system-ui, -apple-system, "Segoe UI", sans-serif); color: #0f172a; }',
    '* { box-sizing: border-box; }',
    '.card { background: #fff; border: 1px solid #e2e8f0; border-radius: var(--cadence-radius, 14px); padding: 20px; max-width: 420px; }',
    'h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.3; }',
    'p.hint { margin: 0 0 16px; font-size: 13px; color: #64748b; }',
    'label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }',
    'input, select, textarea { width: 100%; font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: inherit; }',
    'input:focus, select:focus, textarea:focus { outline: 2px solid var(--cadence-accent, #10b981); outline-offset: 1px; border-color: transparent; }',
    'textarea { resize: vertical; min-height: 64px; }',
    '.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
    '@media (max-width: 420px) { .row { grid-template-columns: 1fr; } }',
    'button { margin-top: 16px; width: 100%; padding: 11px; font: inherit; font-weight: 600; font-size: 15px; color: #fff; background: var(--cadence-accent, #10b981); border: 0; border-radius: 8px; cursor: pointer; }',
    'button[disabled] { opacity: .6; cursor: progress; }',
    '.trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }',
    '.status { margin: 12px 0 0; font-size: 13px; min-height: 1em; }',
    '.status.error { color: #e11d48; }',
    '.done { font-size: 15px; line-height: 1.5; }',
  ].join('\n');

  var FORM = [
    '<label for="name">Nome</label>',
    '<input id="name" name="name" autocomplete="name" required minlength="2" maxlength="120">',
    '<div class="row">',
    '  <div><label for="phone">WhatsApp</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="30"></div>',
    '  <div><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" maxlength="160"></div>',
    '</div>',
    '<label for="weeklyGoal">Quantas vezes por semana quer treinar?</label>',
    '<select id="weeklyGoal" name="weeklyGoal">',
    '  <option value="1">1 vez</option><option value="2">2 vezes</option><option value="3" selected>3 vezes</option>',
    '  <option value="4">4 vezes</option><option value="5">5 vezes</option><option value="6">6 vezes</option><option value="7">Todos os dias</option>',
    '</select>',
    '<label for="message">Mensagem (opcional)</label>',
    '<textarea id="message" name="message" maxlength="500" placeholder="Objetivo, melhor horário, alguma lesão..."></textarea>',
    '<div class="trap" aria-hidden="true"><label for="website">Site</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>',
    '<button type="submit">Quero agendar</button>',
    '<p class="status" role="status" aria-live="polite"></p>',
  ].join('\n');

  function trimmed(form, name) {
    var field = form.elements.namedItem(name);
    return field && field.value ? field.value.trim() : '';
  }

  class CadenceLeadWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      if (!this.shadowRoot.firstChild) this.render();
    }

    get apiBase() {
      return (this.getAttribute('api-base') || scriptOrigin).replace(/\/$/, '');
    }

    get utmSource() {
      var fromUrl = new URLSearchParams(window.location.search).get('utm_source');
      return (fromUrl || this.getAttribute('source') || '').slice(0, 100) || null;
    }

    render() {
      var style = document.createElement('style');
      style.textContent = STYLE;

      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('part', 'card');

      var title = document.createElement('h2');
      title.textContent = this.getAttribute('heading') || 'Agende sua aula experimental';
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Deixe seu contato e a equipe da academia fala com você.';

      var form = document.createElement('form');
      form.innerHTML = FORM;
      form.addEventListener('submit', this.submit.bind(this));

      card.append(title, hint, form);
      this.shadowRoot.replaceChildren(style, card);
    }

    async submit(event) {
      event.preventDefault();
      var form = event.currentTarget;
      var status = form.querySelector('.status');
      var button = form.querySelector('button');
      status.className = 'status';
      status.textContent = '';

      var workspaceId = this.getAttribute('workspace-id');
      if (!workspaceId) {
        status.className = 'status error';
        status.textContent = 'Widget sem workspace-id. Avise a academia.';
        return;
      }
      if (!trimmed(form, 'email') && !trimmed(form, 'phone')) {
        status.className = 'status error';
        status.textContent = 'Informe WhatsApp ou e-mail para a academia retornar.';
        return;
      }

      var payload = {
        name: trimmed(form, 'name'),
        phone: trimmed(form, 'phone') || null,
        email: trimmed(form, 'email') || null,
        weeklyGoal: Number(form.elements.namedItem('weeklyGoal').value),
        message: trimmed(form, 'message') || null,
        utmSource: this.utmSource,
        website: form.elements.namedItem('website').value,
      };

      button.disabled = true;
      button.textContent = 'Enviando...';
      try {
        var url = this.apiBase + '/api/public/v1/workspaces/' + encodeURIComponent(workspaceId) + '/leads';
        var response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          var data = await response.json().catch(function () {
            return null;
          });
          throw new Error((data && data.error) || 'Não foi possível enviar agora. Tente de novo em instantes.');
        }
        var done = document.createElement('p');
        done.className = 'done';
        done.textContent = 'Recebemos seus dados, ' + payload.name.split(' ')[0] + '. A academia vai entrar em contato em breve.';
        form.replaceWith(done);
        this.dispatchEvent(new CustomEvent('cadence:lead-submitted', { bubbles: true, composed: true }));
      } catch (error) {
        status.className = 'status error';
        status.textContent = error instanceof Error ? error.message : String(error);
        button.disabled = false;
        button.textContent = 'Quero agendar';
      }
    }
  }

  window.customElements.define('cadence-lead-widget', CadenceLeadWidget);
})();
