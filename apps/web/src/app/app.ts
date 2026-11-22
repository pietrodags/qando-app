import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './core/layout/app-header';
import { OrganicWavesBgComponent } from './core/layout/organic-waves-bg';
import { Toast } from './shared/ui/toast';

@Component({
  selector: 'app-root',
  imports: [AppHeader, OrganicWavesBgComponent, RouterOutlet, Toast],
  template: `
    <app-organic-waves-bg />
    <app-header />
    <router-outlet />
    <app-toast />
  `,
})
export class App {}
