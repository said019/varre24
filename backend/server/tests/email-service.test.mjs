import assert from "node:assert/strict";
import test from "node:test";

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_PUBLIC_URL;
delete process.env.FRONTEND_URL;
process.env.APP_URL = "https://varre24-web-production.up.railway.app";

const {
  sendBirthdayGreeting,
  sendMembershipActivated,
  sendPasswordResetEmail,
} = await import(`../emailService.js?email-test=${Date.now()}`);

test("los CTA de email nunca exponen el dominio técnico de Railway", async () => {
  const result = await sendMembershipActivated({
    to: "alumna@example.com",
    name: "Ana López",
    planName: "VARRE 8",
    startDate: "2026-07-30",
    endDate: "2026-08-30",
    classLimit: 8,
  });

  assert.equal(result.skipped, true);
  assert.doesNotMatch(result.html, /varre24-web-production\.up\.railway\.app/);
  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/app\/classes/);
  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/brand\/varre24-logo-email-cream\.png/);
});

test("recuperación de contraseña usa el dominio público canónico", async () => {
  const result = await sendPasswordResetEmail({
    to: "alumna@example.com",
    name: "Ana López",
    token: "token-seguro",
    resetUrl: "https://varre24-web-production.up.railway.app/auth/reset-password?token=token-seguro",
  });

  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/auth\/reset-password\?token=token-seguro/);
  assert.doesNotMatch(result.html, /\.up\.railway\.app/);
});

test("la plantilla de cumpleaños mantiene HTML válido dentro del contenido", async () => {
  const result = await sendBirthdayGreeting({
    to: "alumna@example.com",
    name: "Ana López",
    message: "Hoy celebramos tu energía, {name}.",
  });

  assert.match(result.html, /Celebramos contigo/);
  assert.doesNotMatch(result.html, /<tr><td align="center" style="padding:8px 0 24px;">/);
  assert.match(result.html, /Feliz cumplea&ntilde;os/);
});
