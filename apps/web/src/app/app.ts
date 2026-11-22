import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './core/layout/app-header';
import { WavesBackground } from './core/layout/waves-background/waves-background';
import { Toast } from './shared/ui/toast';

@Component({
  selector: 'app-root',
  imports: [AppHeader, RouterOutlet, Toast, WavesBackground],
  template: `
    <app-header />
    <router-outlet />
    <app-toast />
    <app-waves-background />
  `,
})
export class App {}
