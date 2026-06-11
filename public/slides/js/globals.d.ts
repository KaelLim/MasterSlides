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
}

export {};
