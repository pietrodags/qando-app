import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

/** What each permission means, in the organizer's words. */
const PERMISSIONS: Record<string, string> = {
  'events:read': 'Ver tus eventos y sus resultados',
  'events:manage': 'Crear eventos y confirmar fechas en tu nombre',
  offline_access: 'Seguir conectada hasta que la desconectes',
};

/**
 * PROTOTYPE, without design: the consent page of an application's request for access. Shows who
 * asks (the name the application gives itself and the site the answer goes back to) and for
 * what, and answers "Permitir" or "Cancelar"; the API then says where the browser continues.
 */
@Component({
  selector: 'app-connect-page',
  template: `
    <section style="max-width: 32rem; margin: 3rem auto; padding: 0 1rem; display: grid; gap: 1rem">
      <h1 style="font-size: 1.5rem">Conectar una aplicación</h1>
      <p>
        <strong>{{ name() ?? 'Una aplicación' }}</strong> quiere acceder a tu cuenta de qando.
        Después volverás a <strong>{{ returnsTo }}</strong
        >.
      </p>
      <ul style="padding-left: 1.25rem">
        @for (permission of permissions; track permission) {
          <li>{{ permission }}</li>
        }
      </ul>
      <div style="display: flex; gap: 0.75rem">
        <button type="button" [disabled]="answering()" (click)="answer(true)">Permitir</button>
        <button type="button" [disabled]="answering()" (click)="answer(false)">Cancelar</button>
      </div>
      @if (problem(); as problem) {
        <p role="alert">{{ problem }}</p>
      }
    </section>
  `,
})
export class ConnectPage {
  private readonly document = inject(DOCUMENT);
  /** The request as the API signed it: sent back untouched with the answer. */
  private readonly signedQuery = this.document.location.search.replace(/^\?/, '');
  private readonly request = new URLSearchParams(this.signedQuery);

  /** The name the application gives itself; unknown until read, or when it gives none. */
  protected readonly name = signal<string | undefined>(undefined);
  protected readonly returnsTo = hostOf(this.request.get('redirect_uri'));
  protected readonly permissions = (this.request.get('scope') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((scope) => PERMISSIONS[scope] ?? scope);
  protected readonly answering = signal(false);
  protected readonly problem = signal<string | undefined>(undefined);

  constructor() {
    const client = this.request.get('client_id') ?? '';
    void fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(client)}`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((found: { client_name?: string } | undefined) => {
        this.name.set(found?.client_name);
      });
  }

  /** Answers the request and follows where the API sends the browser: back to the application. */
  protected async answer(accept: boolean): Promise<void> {
    this.answering.set(true);
    this.problem.set(undefined);
    const response = await fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept, oauth_query: this.signedQuery }),
    });
    const answered = (await response.json().catch(() => undefined)) as { url?: string } | undefined;
    if (response.ok && answered?.url !== undefined) {
      this.document.location.assign(answered.url);
      return;
    }
    this.answering.set(false);
    this.problem.set(
      `No se ha podido responder (${String(response.status)}). Vuelve a intentarlo desde la aplicación.`,
    );
  }
}

function hostOf(address: string | null): string {
  try {
    return new URL(address ?? '').host;
  } catch {
    return 'la aplicación';
  }
}
