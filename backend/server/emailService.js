/**
 * VARRE24 — Email Service (Resend)
 * Branded HTML templates matching the studio's visual identity.
 */

let resend = null;
if (process.env.RESEND_API_KEY) {
  try {
    const { Resend } = await import("resend");
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch (err) {
    console.warn("[Email] Not setting up Resend. Package missing or invalid key.");
  }
}

const FROM_EMAIL = process.env.EMAIL_FROM || "VARRE24 <onboarding@resend.dev>";
const CANONICAL_APP_URL = "https://www.varre24fit.com";

function normalizePublicUrl(value, fallback = CANONICAL_APP_URL) {
  const normalized = String(value || fallback).trim().replace(/\/+$/, "");
  try {
    // Railway es la infraestructura, no una dirección que deban ver las alumnas.
    // Conservamos este guard para instalaciones antiguas que aún tengan APP_URL
    // apuntando al dominio temporal de Railway.
    if (new URL(normalized).hostname.endsWith(".up.railway.app")) return fallback;
  } catch {
    return fallback;
  }
  return normalized;
}

const APP_URL = normalizePublicUrl(
  process.env.EMAIL_PUBLIC_URL || process.env.FRONTEND_URL || process.env.APP_URL,
);
const EMAIL_ASSET_URL = normalizePublicUrl(process.env.EMAIL_ASSET_URL || APP_URL, APP_URL);
const LOGO_URL = `${EMAIL_ASSET_URL}/brand/varre24-logo-email-cream.png`;

function customerFacingUrl(value) {
  try {
    const url = new URL(String(value || ""), `${APP_URL}/`);
    if (url.hostname.endsWith(".up.railway.app")) {
      return new URL(`${url.pathname}${url.search}${url.hash}`, `${APP_URL}/`).toString();
    }
    return url.toString();
  } catch {
    return APP_URL;
  }
}

// ─── Brand palette (MODDO — vino/rosa, la misma del sitio y el admin) ────────
const B = {
  bg:        "#E9DFDD",   // rosy canvas — fondo exterior
  card:      "#FCF8F7",   // surface — contenido
  ivory:     "#F3EFE9",   // marfil de marca
  border:    "#E8D7D6",   // hairline rosado
  brand:     "#3B0E1A",   // burgundy — acento primario (botones, links, barra superior)
  brandDark: "#320C16",   // burgundy hover/deep
  rose:      "#C9A5A8",   // dusty rose — acento secundario
  pink:      "#FFD6E6",   // soft pink — chips, divisores, highlights
  dark:      "#1A060B",   // ink — encabezados
  body:      "#4A2530",   // texto de párrafo — burgundy suavizado, legible en bloques largos
  muted:     "#9C8A8B",   // texto secundario/discreto
  amber:     "#b45309",   // advertencia (semántico, no de marca)
};

// ─── Tipografía ───────────────────────────────────────────────────────────────
// Poppins vía @import con la misma pila web-safe como fallback: Outlook desktop
// ignora @import y cae directo a Helvetica; Gmail/Apple Mail/Yahoo sí la cargan.
const FONT = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
const DISPLAY_URL = APP_URL.replace(/^https?:\/\//, "");

// ─── Base layout ──────────────────────────────────────────────────────────────
function baseLayout({ preheader = "", content = "", ctaUrl = "", ctaText = "" } = {}) {
  const resolvedCtaUrl = ctaUrl ? customerFacingUrl(ctaUrl) : "";
  const ctaBlock = resolvedCtaUrl
    ? `<tr><td class="email-pad" align="left" style="padding:28px 48px 10px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0">
           <tr><td bgcolor="${B.brand}" style="border-radius:999px;">
             <a href="${resolvedCtaUrl}"
                style="display:inline-block;color:${B.ivory};font-family:${FONT};
                       font-size:11px;font-weight:600;letter-spacing:1.8px;
                       text-transform:uppercase;text-decoration:none;
                       border:1px solid ${B.brand};border-radius:999px;padding:14px 28px;">
               ${ctaText}&nbsp;&nbsp;&rarr;
             </a>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>VARRE24</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    @media only screen and (max-width:620px) {
      .email-shell-pad { padding:0 !important; }
      .email-pad { padding-left:24px !important; padding-right:24px !important; }
      .email-logo { max-width:250px !important; }
      .email-meta { letter-spacing:1.2px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${B.bg};">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="width:100%;background-color:${B.bg};">
    <tr><td class="email-shell-pad" align="center" style="padding:36px 12px 44px;">

      <!-- Editorial email canvas -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
             style="max-width:600px;width:100%;background-color:${B.card};
                    border:1px solid ${B.border};">

        <!-- Branded header -->
        <tr><td class="email-pad" bgcolor="${B.brand}" style="background-color:${B.brand};padding:16px 36px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td class="email-meta" style="font-family:${FONT};font-size:9px;font-weight:500;letter-spacing:2px;
                         text-transform:uppercase;color:${B.rose};">Estudio de movimiento</td>
              <td class="email-meta" align="right" style="font-family:${FONT};font-size:9px;font-weight:500;letter-spacing:2px;
                         text-transform:uppercase;color:${B.rose};">N&aacute;poles &middot; CDMX</td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="email-pad" align="center" bgcolor="${B.brand}"
                style="background-color:${B.brand};padding:38px 48px 12px;">
          <a href="${APP_URL}" style="text-decoration:none;">
            <img class="email-logo" src="${LOGO_URL}" alt="VARRE24" width="300"
                 style="display:block;width:100%;max-width:300px;height:auto;border:0;" />
          </a>
        </td></tr>
        <tr><td class="email-pad" align="center" bgcolor="${B.brand}"
                style="background-color:${B.brand};padding:0 40px 38px;">
          <p style="font-family:${FONT};font-size:10px;font-weight:500;
                    letter-spacing:4px;text-transform:uppercase;color:${B.ivory};margin:0;">
            Barre &middot; Pilates
          </p>
        </td></tr>

        <!-- Content -->
        <tr><td class="email-pad" style="padding:38px 48px 0;background-color:${B.card};">
          ${content}
        </td></tr>

        <!-- CTA -->
        ${ctaBlock}

        <!-- Brand close -->
        <tr><td class="email-pad" style="padding:34px 48px 38px;background-color:${B.card};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="border-top:1px solid ${B.border};font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding-top:24px;font-family:${FONT};font-size:18px;font-weight:300;
                           line-height:1.4;color:${B.brand};">
              Movimiento con intenci&oacute;n.<br>Fuerza que se siente.
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td class="email-pad" align="center" bgcolor="${B.brandDark}"
                style="background-color:${B.brandDark};padding:22px 36px 24px;">
          <p style="font-family:${FONT};font-size:10px;letter-spacing:0.4px;
                    color:${B.rose};margin:0;line-height:1.8;">
            &copy; ${new Date().getFullYear()} VARRE24 &middot; N&aacute;poles, CDMX<br>
            <a href="${APP_URL}" style="color:${B.ivory};text-decoration:none;">${DISPLAY_URL}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function h1(text) {
  return `<h1 style="font-family:${FONT};font-size:28px;font-weight:300;
                      letter-spacing:-0.3px;color:${B.dark};margin:0 0 12px;line-height:1.25;">${text}</h1>`;
}
function h2(text) {
  return `<h2 style="font-family:${FONT};font-size:11px;
                      font-weight:600;color:${B.brand};margin:24px 0 8px;text-transform:uppercase;
                      letter-spacing:2px;">${text}</h2>`;
}
function p(text) {
  return `<p style="font-family:${FONT};font-size:15px;
                     color:${B.body};line-height:1.75;margin:0 0 14px;">${text}</p>`;
}
function small(text) {
  return `<p style="font-family:${FONT};font-size:13px;
                     color:${B.muted};line-height:1.6;margin:0 0 10px;">${text}</p>`;
}
function infoRow(label, value) {
  return `<tr>
    <td style="font-family:${FONT};font-size:13px;
               color:${B.muted};padding:12px 16px;border-bottom:1px solid ${B.border};">${label}</td>
    <td style="font-family:${FONT};font-size:13px;
               color:${B.dark};font-weight:600;padding:12px 16px 12px 10px;
               border-bottom:1px solid ${B.border};text-align:right;">${value}</td>
  </tr>`;
}
function infoTable(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="margin:20px 0 22px;background:${B.ivory};border:1px solid ${B.border};">
    ${rows.join("")}
  </table>`;
}
function pill(text, color) {
  return `<span style="display:inline-block;background:${B.ivory};border:1px solid ${color};
                        color:${color};border-radius:50px;font-size:11px;font-weight:700;
                        padding:5px 14px;letter-spacing:1.2px;text-transform:uppercase;
                        font-family:${FONT};">${text}</span>`;
}
// Los estados conservan contraste semántico, pero dentro de la paleta cálida
// del estudio para que ninguna notificación parezca de un sistema ajeno.
function alertBox(text, type = "info") {
  const colors = {
    info:    { bg: "#F4E6EA", border: B.rose,    text: B.brand },
    success: { bg: "#F1E9EB", border: B.rose,    text: B.brand },
    warning: { bg: "#F7EFE1", border: "#C18A45", text: "#76501F" },
    error:   { bg: "#F6E9E7", border: "#9B5B53", text: "#713E39" },
  };
  const c = colors[type] || colors.info;
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="background:${c.bg};border-left:4px solid ${c.border};
                         margin:14px 0 22px;">
    <tr><td style="padding:14px 16px;font-family:${FONT};
                    font-size:14px;color:${c.text};line-height:1.6;">${text}</td></tr>
  </table>`;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const STUDIO_TIME_ZONE = "America/Mexico_City";

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const raw = String(dateStr);
  // DATE no representa una hora: lo anclamos a mediodía para que nunca se
  // convierta al día anterior al formatearlo en CDMX.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00Z`)
    : new Date(dateStr);
  return d.toLocaleDateString("es-MX", {
    timeZone: STUDIO_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function fmtTime(timeStr) {
  if (!timeStr) return "—";
  const t = String(timeStr).slice(0, 5);
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// ─── Core send function ───────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email to ${to} (${subject})`);
    // El resultado permite previsualizar y probar las plantillas sin hacer un
    // envío real. En producción, con Resend configurado, el flujo no cambia.
    return { skipped: true, subject, html };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    if (error) {
      console.error("[Email] Resend error:", error);
      return { error };
    }
    console.log(`[Email] Sent "${subject}" → ${to} (id: ${data?.id})`);
    return { data };
  } catch (err) {
    console.error("[Email] Exception sending email:", err.message);
    return { error: err };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 1. MEMBRESÍA ACTIVADA ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendMembershipActivated(opts) {
  const { to, name, planName, startDate, endDate, classLimit } = opts;
  const classesText = classLimit ? `${classLimit} clases` : "Ilimitadas";
  const content = `
    ${h1(`¡Bienvenida, ${name.split(" ")[0]}!`)}
    ${p("Tu membresía en VARRE24 ha sido activada. Es momento de moverte con propósito.")}
    ${infoTable([
      infoRow("Plan", planName),
      infoRow("Clases incluidas", classesText),
      infoRow("Inicio", fmtDate(startDate)),
      infoRow("Vencimiento", fmtDate(endDate)),
    ])}
    ${alertBox("Reserva tus clases desde tu perfil y empieza a disfrutar del estudio.", "success")}
  `;
  const html = baseLayout({
    preheader: `Tu membresía ${planName} está activa. ¡Reserva tus clases!`,
    content,
    ctaUrl: `${APP_URL}/app/classes`,
    ctaText: "Reservar clases",
  });
  return sendEmail({ to, subject: `Tu membresía está activa — VARRE24`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 2. RESERVA CONFIRMADA ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendBookingConfirmed(opts) {
  const { to, name, className, date, startTime, instructor, classesLeft, isWaitlist } = opts;

  const statusPill = isWaitlist
    ? pill("Lista de espera", B.amber)
    : pill("Confirmada", B.brand);

  const classesLeftText = classesLeft === null
    ? "Ilimitadas"
    : classesLeft !== undefined
      ? `${classesLeft} clases restantes`
      : null;

  const waitlistNote = isWaitlist
    ? alertBox("Estás en la <strong>lista de espera</strong>. Te notificaremos si se libera un lugar.", "warning")
    : "";

  const content = `
    ${h1(isWaitlist ? `En lista de espera, ${name.split(" ")[0]}` : `Reserva confirmada, ${name.split(" ")[0]}`)}
    ${p(isWaitlist
      ? "Te hemos añadido a la lista de espera para la siguiente clase:"
      : "Tu clase ha sido reservada con éxito. ¡Te esperamos en el estudio!"
    )}
    <div style="text-align:center;margin:8px 0 16px;">${statusPill}</div>
    ${infoTable([
      infoRow("Clase", className),
      infoRow("Fecha", fmtDate(date)),
      infoRow("Hora", fmtTime(startTime)),
      ...(instructor ? [infoRow("Instructora", instructor)] : []),
      ...(classesLeftText ? [infoRow("Tu paquete", classesLeftText)] : []),
    ])}
    ${waitlistNote}
    ${alertBox("Puedes cancelar hasta <strong>2 horas antes</strong> de la clase para recuperar tu crédito. Cancelaciones tardías no son reembolsables.", "warning")}
  `;
  const html = baseLayout({
    preheader: isWaitlist ? `En lista de espera para ${className}` : `Reserva confirmada: ${className} — ${fmtDate(date)}`,
    content,
    ctaUrl: `${APP_URL}/app/bookings`,
    ctaText: "Ver mis reservas",
  });
  return sendEmail({ to, subject: isWaitlist ? `En lista de espera — ${className}` : `Reserva confirmada — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 3. RESERVA CANCELADA ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendBookingCancelled(opts) {
  const { to, name, className, date, startTime, creditRestored, isLate, classesLeft } = opts;

  const classesLeftText = classesLeft === null ? "Ilimitadas" : classesLeft !== undefined ? `${classesLeft} clases` : null;

  const creditBlock = creditRestored
    ? alertBox("Tu clase fue <strong>devuelta a tu paquete</strong>. Cancelaste con más de 2 horas de anticipación.", "success")
    : alertBox("La clase <strong>no se devolvió</strong> a tu paquete. La cancelación fue con menos de 2 horas de anticipación.", "error");

  const content = `
    ${h1(`Reserva cancelada, ${name.split(" ")[0]}`)}
    ${p("Tu reserva para la siguiente clase ha sido cancelada:")}
    ${infoTable([
      infoRow("Clase", className),
      infoRow("Fecha", fmtDate(date)),
      infoRow("Hora", fmtTime(startTime)),
      ...(classesLeftText ? [infoRow("Clases restantes", classesLeftText)] : []),
    ])}
    ${creditBlock}
    ${isLate
      ? small("Recuerda: para cancelar tu reserva se tiene como mínimo 2 horas de anticipación. De no hacerlo se pierde la clase y no hay reposición.")
      : p("¿Quieres reservar otra clase? Hay muchos horarios disponibles.")
    }
  `;
  const html = baseLayout({
    preheader: creditRestored ? "Clase devuelta a tu paquete." : "Cancelación tardía — clase no devuelta.",
    content,
    ctaUrl: `${APP_URL}/app/classes`,
    ctaText: "Ver horario",
  });
  return sendEmail({ to, subject: `Reserva cancelada — ${className}`, html });
}

// Cancelación iniciada por el estudio (no por la alumna) — la clase entera se
// canceló, no la reserva individual. El copy deja claro que no fue su culpa.
async function sendClassCancelledByStudio(opts) {
  const { to, name, className, date, startTime, creditRestored } = opts;

  const content = `
    ${h1(`Clase cancelada, ${name.split(" ")[0]}`)}
    ${p("El estudio tuvo que cancelar la siguiente clase. Lamentamos el inconveniente:")}
    ${infoTable([
      infoRow("Clase", className),
      infoRow("Fecha", fmtDate(date)),
      infoRow("Hora", fmtTime(startTime)),
    ])}
    ${creditRestored
      ? alertBox("Tu clase fue <strong>devuelta a tu paquete</strong> — no se descontó nada.", "success")
      : ""
    }
    ${p("¿Quieres reservar otra clase? Hay muchos horarios disponibles.")}
  `;
  const html = baseLayout({
    preheader: `Cancelamos ${className} del ${fmtDate(date)}. Tu clase fue devuelta a tu paquete.`,
    content,
    ctaUrl: `${APP_URL}/app/classes`,
    ctaText: "Ver horario",
  });
  return sendEmail({ to, subject: `Clase cancelada por el estudio — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 4. RECORDATORIO SEMANAL ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendWeeklyReminder(opts) {
  const { to, name, classesLeft, endDate } = opts;

  const classesText = classesLeft === null
    ? "Tienes clases <strong>ilimitadas</strong> esta semana."
    : `Tienes <strong>${classesLeft} clase${classesLeft !== 1 ? "s" : ""}</strong> disponible${classesLeft !== 1 ? "s" : ""} en tu paquete.`;

  const expiryNote = endDate
    ? alertBox(`Tu membresía vence el <strong>${fmtDate(endDate)}</strong>. ¡Aprovecha tus clases!`, "warning")
    : "";

  const content = `
    ${h1(`¡Hola ${name.split(" ")[0]}! ¿Ya programaste tu semana?`)}
    ${p("Nueva semana, nuevas oportunidades para moverte. Estos son los horarios disponibles en VARRE24.")}
    ${p(classesText)}
    ${expiryNote}
    ${h2("Tu cuerpo te lo agradece")}
    ${p("Pilates <strong>fortalece tu core</strong>, mejora tu postura y eleva tu bienestar. ¡Cada clase cuenta!")}
  `;
  const html = baseLayout({
    preheader: `Nueva semana — ${classesLeft === null ? "clases ilimitadas" : `${classesLeft} clases disponibles`}.`,
    content,
    ctaUrl: `${APP_URL}/app/classes`,
    ctaText: "Programar mi semana",
  });
  return sendEmail({ to, subject: `Programa tu semana — VARRE24`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 5. RECORDATORIO DE RENOVACIÓN ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendRenewalReminder(opts) {
  const { to, name, planName, classesLeft, endDate, reason } = opts;

  const isLastClass = reason === "last_class";

  const urgencyBlock = isLastClass
    ? alertBox(`Te queda <strong>1 sola clase</strong> en tu paquete ${planName}. ¡Renueva antes de quedarte sin acceso!`, "warning")
    : alertBox(`Tu membresía <strong>${planName}</strong> vence el <strong>${fmtDate(endDate)}</strong>. ¡Renueva para seguir entrenando!`, "warning");

  const content = `
    ${h1(`${name.split(" ")[0]}, es momento de renovar`)}
    ${urgencyBlock}
    ${p("Mantener tu constancia es la clave del progreso. No dejes que tu entrenamiento se detenga.")}
    ${infoTable([
      infoRow("Plan actual", planName),
      ...(classesLeft !== null ? [infoRow("Clases restantes", `${classesLeft}`)] : []),
      ...(endDate ? [infoRow("Vencimiento", fmtDate(endDate))] : []),
    ])}
    ${p(isLastClass
      ? "Reserva esa última clase hoy y renueva tu paquete para seguir sin interrupciones."
      : "Renueva antes del vencimiento para mantener tu ritmo en el estudio."
    )}
  `;
  const html = baseLayout({
    preheader: isLastClass ? "¡Solo te queda 1 clase! Renueva tu paquete." : "Tu membresía vence pronto — renueva ahora.",
    content,
    ctaUrl: `${APP_URL}/app/checkout`,
    ctaText: "Renovar membresía",
  });
  return sendEmail({
    to,
    subject: isLastClass
      ? `Te queda 1 clase — Renueva tu membresía`
      : `Tu membresía vence pronto — VARRE24`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 6. RECUPERACIÓN DE CONTRASEÑA ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendPasswordResetEmail(opts) {
  const { to, name, token, resetUrl } = opts;
  const firstName = String(name || "").trim().split(/\s+/)[0] || "Alumna";
  const resolvedResetUrl = customerFacingUrl(
    resetUrl || `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
  );
  const content = `
    ${h1(`Recupera tu contraseña, ${firstName}`)}
    ${p("Recibimos una solicitud para cambiar la contraseña de tu cuenta en VARRE24.")}
    ${p("Si fuiste tú, haz clic en el botón de abajo para crear una contraseña nueva. Este enlace expira en <strong>2 horas</strong>.")}
    ${alertBox("Si no solicitaste este cambio, puedes ignorar este correo. Tu cuenta seguirá segura.", "info")}
    ${small(`Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${resolvedResetUrl}" style="color:${B.brand};word-break:break-all;">${resolvedResetUrl}</a>`)}
  `;
  const html = baseLayout({
    preheader: "Recupera el acceso a tu cuenta de VARRE24",
    content,
    ctaUrl: resolvedResetUrl,
    ctaText: "Restablecer contraseña",
  });
  return sendEmail({ to, subject: "Restablecer contraseña — VARRE24", html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 7. RECHAZO DE COMPROBANTE ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendOrderRejected(opts) {
  const { to, name, reason } = opts;
  const content = `
    ${h1(`Comprobante no aprobado`)}
    ${p(`Hola ${name.split(" ")[0]}, revisamos tu comprobante de pago y lamentablemente <strong>no pudo ser aprobado</strong>.`)}
    ${alertBox(`<strong>Motivo:</strong> ${reason}`, "error")}
    ${p("Si crees que hubo un error, contáctanos por WhatsApp o acércate al estudio. ¡Estamos para ayudarte!")}
  `;
  const html = baseLayout({
    preheader: "Tu comprobante de pago fue revisado — VARRE24",
    content,
    ctaUrl: `${APP_URL}/app/checkout`,
    ctaText: "Reintentar pago",
  });
  return sendEmail({ to, subject: "Comprobante no aprobado — VARRE24", html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 9. COMUNICADO PERSONALIZADO ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// Convierte un body en texto plano (con saltos de línea dobles para párrafos)
// en HTML envuelto en el layout del estudio. Soporta {name} para personalizar.
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bodyToHtml(text) {
  const safe = escapeHtml(text).replace(/\n/g, "<br/>");
  // dobles <br> → cierre/apertura de párrafo, mejora legibilidad
  const paragraphs = safe.split(/<br\/><br\/>/).map((para) => p(para)).join("");
  return paragraphs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 10. FELICITACIÓN DE CUMPLEAÑOS ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function sendBirthdayGreeting({ to, name, message, ctaUrl, ctaText }) {
  const firstName = (name || "").split(" ")[0] || "Hola";
  const personalized = String(message || "").replace(/\{name\}/gi, firstName);
  const safeBody = String(personalized).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])).replace(/\n/g, "<br/>");
  const paragraphs = safeBody.split(/<br\/><br\/>/).map((para) => p(para)).join("");

  const heroBlock = `
    <div style="padding:2px 0 24px;">
      <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:2.6px;
                  text-transform:uppercase;color:${B.rose};margin-bottom:12px;">
        Celebramos contigo
      </div>
      <h1 style="font-family:${FONT};font-size:36px;line-height:1.15;font-weight:300;
                 color:${B.dark};margin:0;letter-spacing:-0.5px;">
        Feliz cumplea&ntilde;os,<br>${escapeHtml(firstName)}.
      </h1>
      <div style="width:48px;height:2px;background:${B.pink};margin:22px 0 0;"></div>
    </div>`;

  const content = `
    ${heroBlock}
    <div style="padding-top:4px;">
      ${paragraphs}
    </div>
  `;
  const html = baseLayout({
    preheader: `${firstName}, hoy celebramos contigo · VARRE24`,
    content,
    ctaUrl: ctaUrl || `${APP_URL}/app/classes`,
    ctaText: ctaText || "Reservar mi clase de cumpleaños",
  });
  return sendEmail({ to, subject: `🎂 ¡Feliz cumpleaños, ${firstName}! — VARRE24`, html });
}

async function sendCustomBroadcast({ to, name, subject, body, ctaUrl, ctaText, headline }) {
  const firstName = (name || "").split(" ")[0] || "Hola";
  const personalizedBody = String(body || "").replace(/\{name\}/gi, firstName);
  const content = `
    ${headline ? h1(headline.replace(/\{name\}/gi, firstName)) : h1(`Hola, ${firstName}`)}
    ${bodyToHtml(personalizedBody)}
  `;
  const html = baseLayout({
    preheader: subject,
    content,
    ctaUrl: ctaUrl || "",
    ctaText: ctaText || "",
  });
  return sendEmail({ to, subject: subject || "VARRE24 — Mensaje del estudio", html });
}

// ═════════════════════════════════════════════════════════════════════════════
// ── 11. NUEVA ORDEN POR VERIFICAR (Grupo B — para la admin) ──────────────────
// ═════════════════════════════════════════════════════════════════════════════
async function sendAdminNewOrderToVerify({ to, orderNumber, orderId, planName, alumnaName, amount, expiresAt }) {
  const expiresDisplay = expiresAt
    ? new Date(expiresAt).toLocaleString("es-MX", { timeZone: STUDIO_TIME_ZONE, dateStyle: "medium", timeStyle: "short" })
    : "24 horas";
  const content = `
    ${h1("Nueva orden por verificar")}
    ${p(`<strong>${alumnaName || "Una alumna"}</strong> subió comprobante de transferencia. La membresía ya está activa de forma <strong>provisional</strong>.`)}
    ${p(`Si no la revisas antes de <strong>${expiresDisplay}</strong>, el sistema decide:<br>
        • si ya tomó clase → la deja activa<br>
        • si NO tomó clase → la revierte automáticamente`)}
    ${alertBox(
      `<strong>Plan:</strong> ${planName || "—"}<br>
       <strong>Orden:</strong> ${orderNumber || orderId}<br>
       <strong>Monto:</strong> $${Number(amount || 0).toLocaleString("es-MX")} MXN`,
      "info"
    )}
  `;
  const html = baseLayout({
    preheader: `${alumnaName || "Alumna"} subió comprobante — revisa antes de ${expiresDisplay}`,
    content,
    ctaUrl: `${APP_URL}/admin/payments`,
    ctaText: "Revisar orden",
  });
  return sendEmail({ to, subject: `Nueva orden por verificar — ${planName || "Plan"}`, html });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendClassCancelledByStudio,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  sendOrderRejected,
  sendCustomBroadcast,
  sendBirthdayGreeting,
  sendAdminNewOrderToVerify,
};
