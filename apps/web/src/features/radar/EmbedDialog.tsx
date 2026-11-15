import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, CodeXml, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

/** Mostra ao dono o trecho de HTML para colocar o formulário de leads no site da academia. */
export function EmbedDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const snippet = [
    `<script src="${origin}/embed/cadence-widget.js" defer></script>`,
    `<cadence-lead-widget workspace-id="${workspaceId}"></cadence-lead-widget>`,
  ].join('\n');

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CodeXml />
        Widget do site
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Formulário de leads no site da academia</DialogTitle>
            <DialogDescription>
              Cole este trecho no HTML do site (WordPress, Webflow, Wix ou página própria). Quem preencher entra no
              Radar como aluno novo, na coluna Ativos, com a origem registrada na timeline.
            </DialogDescription>
          </DialogHeader>
          <pre className="overflow-x-auto rounded-lg bg-[#090D16] p-4 text-xs leading-relaxed text-emerald-200">
            {snippet}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copiado' : 'Copiar código'}
            </Button>
            <Button variant="outline" asChild>
              <a href={`/embed/demo.html?workspace=${workspaceId}`} target="_blank" rel="noreferrer">
                <ExternalLink />
                Ver página de exemplo
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
