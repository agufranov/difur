import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/* Обычная сборка: dist/ из корневого index.html.
   Режим test: dist-test/ с тестовыми страницами — те же модули приложения
   плюс драйверы headless-прогона (tests/run.ps1 поднимает статический сервер
   и скармливает их Edge). */
export default defineConfig(({ mode }) => ({
  base: './',
  build: mode === 'test'
    ? {
        outDir: 'dist-test',
        rollupOptions: {
          input: {
            ui: resolve(import.meta.dirname, 'tests/ui.html'),
            mobile: resolve(import.meta.dirname, 'tests/mobile.html'),
          },
        },
      }
    : { outDir: 'dist' },
}));
