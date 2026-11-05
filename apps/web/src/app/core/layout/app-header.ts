import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Header of every page: the logo back to the home page and the "Entrar" icon. */
@Component({
  selector: 'app-header',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  styleUrl: './app-header.scss',
  template: `
    <header class="header">
      <a class="logo-link" routerLink="/">
        <img
          class="logo"
          ngSrc="/logo.svg"
          width="1116"
          height="304"
          priority
          [alt]="'common.logoAlt' | transloco"
        />
      </a>
      <a class="sign-in" routerLink="/sign-in" [attr.aria-label]="'shell.signIn' | transloco">
        <!-- Heroicons outline: user-circle -->
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </a>
    </header>
  `,
})
export class AppHeader {}
