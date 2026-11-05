import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './core/layout/app-header';

@Component({
  selector: 'app-root',
  imports: [AppHeader, RouterOutlet],
  template: `
    <app-header />
    <router-outlet />
  `,
})
export class App {}
