// Ambient declarations for globals loaded via <script> CDN in index.html.
// These don't ship as npm packages — we get them from the browser global scope.

declare global {
  // qrcodejs (https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js)
  class QRCode {
    constructor(
      el: HTMLElement | string,
      options: { text: string; width?: number; height?: number },
    );
    static CorrectLevel: { L: number; M: number; Q: number; H: number };
  }

  // html2canvas (https://html2canvas.hertzen.com/dist/html2canvas.min.js)
  function html2canvas(
    element: HTMLElement,
    options?: {
      backgroundColor?: string | null;
      scale?: number;
      logging?: boolean;
      useCORS?: boolean;
      allowTaint?: boolean;
      width?: number;
      height?: number;
    },
  ): Promise<HTMLCanvasElement>;

  // PptxGenJS (https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js)
  // Loosely typed — we only touch a handful of methods. Text/image/background
  // option bags are Record<string, unknown> rather than the full upstream
  // union so we don't have to vendor the whole .d.ts.
  interface PptxTextRun {
    text: string;
    options?: Record<string, unknown>;
  }
  interface PptxSlide {
    background: { data?: string; path?: string; color?: string };
    addText(text: string | PptxTextRun[], options: Record<string, unknown>): void;
    addImage(options: Record<string, unknown>): void;
  }
  class PptxGenJS {
    layout: string;
    defineLayout(opts: { name: string; width: number; height: number }): void;
    addSlide(): PptxSlide;
    writeFile(opts: { fileName: string }): Promise<string>;
  }
}

export {};
