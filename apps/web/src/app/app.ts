import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './core/layout/app-header';
import { Toast } from './shared/ui/toast';

@Component({
  selector: 'app-root',
  imports: [AppHeader, RouterOutlet, Toast],
  template: `
    <app-header />
    <router-outlet />
    <app-toast />
  `,
})
export class App {}
