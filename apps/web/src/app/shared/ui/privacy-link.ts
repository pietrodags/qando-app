import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * "Privacidad y condiciones" where someone without an account gives their name or email: a small
 * grey link in the text around it, opening the page in a new tab so nothing typed in the form is
 * lost (owner, 2026-11-24). Where it sits and its size are the form's.
 */
@Component({
  selector: 'app-privacy-link',
  imports: [RouterLink, TranslocoPipe],
  styleUrl: './privacy-link.scss',
  template: `<a class="link" routerLink="/privacy" target="_blank">{{
    'shell.privacy' | transloco
  }}</a>`,
})
export class PrivacyLink {}
