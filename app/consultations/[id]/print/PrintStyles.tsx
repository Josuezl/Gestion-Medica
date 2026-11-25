export default function PrintStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      * { box-sizing: border-box; }
      body {
        background: #e2e8f0; margin: 0; padding: 0;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #0f172a;
      }
      .page-wrap { display: flex; flex-direction: column; align-items: center; padding: 24px 12px 48px; }
      .sheet {
        width: 200mm; min-height: 277mm; background: #ffffff;
        padding: 14mm 16mm; box-shadow: 0 8px 30px rgba(15,23,42,0.12);
        display: flex; flex-direction: column;
      }

      .control-bar {
        background: #0f172a; color: #fff; padding: 14px 28px;
        display: flex; justify-content: space-between; align-items: center;
        position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 12px rgba(0,0,0,0.18);
      }
      .control-title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; margin: 0; }
      .control-buttons { display: flex; gap: 10px; }
      .btn-print {
        display: inline-flex; align-items: center; gap: 8px; background: #0d9488; color: #fff;
        border: none; padding: 10px 20px; border-radius: 9px; font-size: 13.5px; font-weight: 700;
        cursor: pointer; font-family: inherit; transition: background .15s, transform .1s;
      }
      .btn-print:hover { background: #0f766e; }
      .btn-print:active { transform: translateY(1px); }
      .btn-close {
        display: inline-flex; align-items: center; background: transparent; color: #cbd5e1;
        border: 1px solid #334155; padding: 10px 18px; border-radius: 9px; font-size: 13.5px;
        font-weight: 600; cursor: pointer; font-family: inherit; transition: background .15s, color .15s;
      }
      .btn-close:hover { background: #1e293b; color: #fff; }

      /* Cabecera centrada (igual a la receta) */
      .header { text-align: center; }
      .header-logo { display: block; margin: 0 auto 4px; max-height: 125px; max-width: 70%; object-fit: contain; }
      .clinic-name { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.01em; }
      .clinic-detail { margin: 3px 0 0; font-size: 10px; color: #64748b; }
      .doc-block { margin-top: 7px; }
      .doctor-name { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
      .doctor-specialty { margin: 1px 0 0; font-size: 11px; font-weight: 600; color: #0d9488; }

      .doc-title { text-align: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #0d9488; margin: 12px 0 0; }
      .divider { height: 1px; background: #e2e8f0; margin: 10px 0 12px; }

      /* Paciente + vitales en línea (mismo formato que la receta) */
      .patient { background: #f8fafc; border: 1px solid #e9eef4; border-radius: 8px; padding: 9px 13px; }
      .prow { display: flex; justify-content: space-between; gap: 14px; }
      .prow + .prow { margin-top: 5px; }
      .plabel { font-size: 8.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
      .pval { font-size: 13px; font-weight: 600; color: #1e293b; }
      .ped-tag { margin-left: 8px; font-size: 9px; background: rgba(13,148,136,0.1); color: #0d9488; padding: 1px 7px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
      .vitals { display: flex; flex-wrap: wrap; gap: 5px 16px; margin-top: 7px; }
      .vital { font-size: 11px; color: #475569; }
      .vital strong { color: #0f172a; }

      /* Secciones clínicas */
      .body { flex: 1; margin-top: 16px; }
      .section { margin-bottom: 14px; }
      .section-title { font-size: 13px; font-weight: 700; color: #0d9488; margin: 0 0 5px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
      .section-body { font-size: 12px; color: #334155; line-height: 1.55; margin: 0; white-space: pre-line; }

      /* Pie: QR + firma */
      .sign-area { margin-top: 26px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
      .qr-box { display: flex; align-items: center; gap: 12px; max-width: 300px; text-align: left; }
      .qr-box img { width: 84px; height: 84px; }
      .qr-cap-title { font-size: 11px; font-weight: 700; color: #0f172a; margin: 0; }
      .qr-cap-text { font-size: 9px; color: #64748b; margin: 2px 0 0; line-height: 1.3; }
      .qr-code { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700; color: #0d9488; margin: 4px 0 0; letter-spacing: 0.04em; }
      .sign { text-align: center; min-width: 200px; }
      .sign img { max-height: 135px; max-width: 340px; object-fit: contain; display: block; margin: 0 auto 4px; }
      .sign-empty { height: 74px; }
      .sign-line { border-top: 1px solid #334155; padding-top: 4px; }
      .sign-name { margin: 0; font-size: 12.5px; font-weight: 700; color: #0f172a; }
      .sign-spec { margin: 1px 0 0; font-size: 10px; color: #475569; }
      .sign-id { margin: 1px 0 0; font-size: 9.5px; color: #64748b; }

      @media print {
        body { background: #ffffff; }
        @page { size: A4; margin: 0; }
        .no-print { display: none !important; }
        .page-wrap { padding: 0; display: block; }
        .sheet { width: 210mm; min-height: 297mm; box-shadow: none; padding: 16mm 16mm; }
        .section { page-break-inside: avoid; }
        .patient { page-break-inside: avoid; }
        .sign-area { page-break-inside: avoid; }
      }
    `}} />
  )
}
