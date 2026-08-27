import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/* Обычная сборка: dist/ из корневого index.html.
   Режим test: dist-test/ с тестовыми страницами — те же модули приложения
   плюс драйверы headless-прогона (tests/run.ps1 поднимает статический сервер
   и скармливает их Edge). */
export default defineConfig(({ mode }) => ({
  base: './',
  /* esbuild только сжимает CSS; штатный минификатор переписывал
     `(max-width:760px)` в range-синтаксис `(width<=760px)`, и тест на
     совпадение @media с константой MOB (src/ui/state.ts) переставал видеть
     порог телефона в CSSOM */
  build: mode === 'test'
    ? {
        cssMinify: 'esbuild' as const,
        outDir: 'dist-test',
        rollupOptions: {
          input: {
            ui: resolve(import.meta.dirname, 'tests/ui.html'),
            mobile: resolve(import.meta.dirname, 'tests/mobile.html'),
          },
        },
      }
    : { cssMinify: 'esbuild' as const, outDir: 'dist' },
}));
